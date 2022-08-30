import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import {
  APP_NAME,
  getJwtTokenFromHttpAuthenticationHeader,
  isDevelopmentEnvironment,
} from "../util";
import {
  ClientServerGoodbyeMessage,
  ClientServerHandshakeMessage,
  ControlMessage,
  DebugClientUpdateMessage,
  Message,
  SynchronizationModeFullEntriesQuery,
  SynchronizationModeFullEntriesResponse,
  SynchronizationModeFullMetaQuery,
  SynchronizationModeFullMetaResponse,
  SynchronizationModeRecentRequestMessage,
  SynchronizationModeRecentResponseMessage,
} from "./message";
import { Container } from "typedi";
import { SERVER_ID } from "../env";
import {
  BadClientIdError,
  BadParameterError,
  HistoryCursorInvalidError,
  UserAuthenticationError,
} from "../error";
import { getManager } from "../db";
import { Client } from "../entity/client";
import { History, HistoryCursor } from "../entity/history";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import debug from "debug";

import { HistoryService } from "../service/history";
import { PAGE_SIZE } from "../route";
import { In, MoreThan } from "typeorm";
import { Entry } from "../entity/entry";
import { ClientService } from "../service/client";
import { EntryService } from "../service/entry";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    const serverId = Container.get(SERVER_ID);
    let userId: string;
    let clientId: string;

    const send = (message: Message) => {
      const response = Object.assign({}, message);
      for (let i = 0; i < response.errors.length; ++i) {
        response.errors[i] = {
          name: response.errors[i].constructor.name,
          message: response.errors[i].message,
        };
      }

      socket.send(JSON.stringify(response));
    };

    const reply = (request: Message, response: Message) => {
      response.session = request.session;
      send(response);
    };

    const replyUnrecognizedMessage = (message: Message) => {
      reply(
        message,
        new ControlMessage([
          new BadParameterError("Unrecognized message type."),
        ])
      );
    };

    // Handshaking
    {
      // Authenticate user
      {
        const authenticationHeader = String(request.headers.authorization);
        const token =
          getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

        if (!token) {
          send(
            new ClientServerHandshakeMessage([
              new BadParameterError("No token."),
            ])
          );
          socket.close();
          return;
        }

        const jwtPayload = jwt.decode(token);
        if (!jwtPayload) {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("Fail to decode JWT."),
            ])
          );
          socket.close();
          return;
        }

        if (typeof jwtPayload !== "object") {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("JWT payload should be object."),
            ])
          );
          socket.close();
          return;
        }

        userId = jwtPayload.userId;
        if (!userId) {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("`userId` not found."),
            ])
          );
          socket.close();
          return;
        }
      }

      // Get client id
      {
        clientId = String(request.headers["a-cycle-client-uid"]);
        if (!uuidValidate(clientId) || !(uuidVersion(clientId) === 4)) {
          send(new ClientServerHandshakeMessage([new BadClientIdError()]));
          socket.close();
          return;
        }
      }

      // Finish handshaking
      send(new ClientServerHandshakeMessage([], serverId, userId, clientId));
    }

    const logger = debug(`${APP_NAME}:${userId}:${clientId}`);
    logger("Finished handshaking, proceed to sync.");

    const manager = getManager();
    const historyService = Container.get(HistoryService);
    const clientService = Container.get(ClientService);
    const entryService = Container.get(EntryService);

    const syncStatus = {
      server2client: {
        goodbye: false,
        "sync-full-meta-query-count": 0,
      },
      client2server: {
        "sync-recent-processing": false,
        "sync-full-entries-response-count": 0,
        "cursor-when-sync-full-started": null as HistoryCursor | null,
        goodbye: false,
      },
    };

    // Request entries synchronization from client to server
    {
      const client = await manager.findOne(Client, {
        where: { uid: clientId },
      });
      if (client) {
        logger("Client record found, try to perform a recent-sync.");

        syncStatus.client2server["sync-recent-processing"] = true;

        send(new SynchronizationModeRecentRequestMessage(client.historyCursor));
      } else {
        logger(
          "Client record not found, record this client and then perform a full-sync."
        );
        syncStatus.server2client["sync-full-meta-query-count"]++;

        const client = manager.create(Client, {
          uid: clientId,
          user: {
            id: userId,
          },
        });
        await manager.save(client);

        send(new SynchronizationModeFullMetaQuery(0));
      }
    }

    socket.on("message", async (data) => {
      let message: Message;
      try {
        message = JSON.parse(data.toString());
      } catch (err) {
        if (err instanceof SyntaxError) {
          send(new ControlMessage([new BadParameterError("Bad JSON syntax.")]));
          socket.close();
          return;
        } else {
          logger(err);
          throw err;
        }
      }

      if (typeof message.session !== "string" || message.session === "") {
        send(
          new ControlMessage([
            new BadParameterError(
              "Messsage should contain an non-empty session of string type."
            ),
          ])
        );
        socket.close();
        return;
      }

      // Handle message accroding to message type
      switch (message.type) {
        case "": {
          reply(
            message,
            new ControlMessage([
              new BadParameterError(
                "Each message must contain a valid `type` field."
              ),
            ])
          );
          break;
        }

        case "sync-recent-request": {
          const { historyCursor } = (
            message as SynchronizationModeRecentRequestMessage
          ).payload;
          const history = await historyService.locateHistoryCursor(
            historyCursor
          );
          if (!history) {
            // Broken history cursor, which indicates client to fall back to full sync.
            reply(
              message,
              new ControlMessage([new HistoryCursorInvalidError()])
            );
            break;
          }

          // Valid history cursor, get histories after that cursor and send relating entries to client
          const histories = await manager.find(History, {
            where: {
              id: MoreThan(history.id),
            },
            order: {
              id: "ASC",
            },
            take: PAGE_SIZE,
          });
          const nextHistroyCursor = histories[histories.length - 1];

          const entries = await manager.find(Entry, {
            where: {
              uid: In(histories.map((history) => history.entryId)),
            },
          });
          const plainEntries = entries.map((entry) => entry.toPlainEntry());

          reply(
            message,
            new SynchronizationModeRecentResponseMessage(
              nextHistroyCursor,
              plainEntries
            )
          );
        }

        case "sync-recent-response": {
          // Check errors
          const errors = message.errors;
          if (errors.length > 0) {
            // If errors, sync-recent won't work.
            // We have to fallback to sync-full.
            syncStatus.client2server["sync-recent-processing"] = false;
            syncStatus.server2client["sync-full-meta-query-count"]++;
            send(new SynchronizationModeFullMetaQuery(0));

            break;
          }

          const { historyCursor, entries } =
            message.payload as SynchronizationModeRecentResponseMessage["payload"];

          await Promise.allSettled(
            entries.map((entry) => {
              return entryService.updateEntryIfFresher(userId, entry);
            })
          );
          await clientService.updateClientHistoryCursor(
            userId,
            clientId,
            historyCursor
          );

          if (entries.length === 0) {
            // If `entries` are empty, we must reach the end of history and sync-recent has completed.
            syncStatus.client2server["sync-recent-processing"] = false;
          } else {
            // Continue to request client for sync-recent with lastest histroy cursor
            send(new SynchronizationModeRecentRequestMessage(historyCursor));
          }

          break;
        }

        case "sync-full-meta-query": {
          const { skip } = (message as SynchronizationModeFullMetaQuery)
            .payload;
          const cursor = await historyService.getLastestCursor(userId);
          const entries = await manager.find(Entry, {
            where: {
              owner: {
                id: userId,
              },
            },
            skip: skip,
            take: PAGE_SIZE,
          });
          const meta = entries.map((entry) => entry.toMetadata());

          reply(
            message,
            new SynchronizationModeFullMetaResponse(skip, cursor, meta)
          );

          break;
        }

        case "sync-full-meta-response": {
          const { skip, currentCursor, entryMetadata } = (
            message as SynchronizationModeFullMetaResponse
          ).payload;

          if (skip === 0 && currentCursor) {
            syncStatus.client2server["cursor-when-sync-full-started"] =
              currentCursor;
          }

          if (
            !syncStatus.client2server["cursor-when-sync-full-started"] &&
            currentCursor
          ) {
            syncStatus.client2server["cursor-when-sync-full-started"] =
              currentCursor;
          }

          if (entryMetadata.length === 0) {
            break;
          }

          const fresherEntryMetadata = await entryService.filterFresherMetadata(
            entryMetadata
          );
          send(
            new SynchronizationModeFullEntriesQuery(
              fresherEntryMetadata.map((meta) => meta.uid)
            )
          );

          break;
        }

        case "sync-full-entries-query": {
          const { uids } = (message as SynchronizationModeFullEntriesQuery)
            .payload;

          const entries = await manager.find(Entry, {
            where: {
              uid: In(uids),
              owner: {
                id: userId,
              },
            },
          });

          const plainEntries = entries.map((entry) => entry.toPlainEntry());

          reply(
            message,
            new SynchronizationModeFullEntriesResponse(plainEntries)
          );
        }

        case "sync-full-entries-response": {
          const { entries } = (
            message as SynchronizationModeFullEntriesResponse
          ).payload;
          syncStatus.client2server["sync-full-entries-response-count"]++;

          await Promise.allSettled(
            entries.map((entry) =>
              entryService.updateEntryIfFresher(userId, entry)
            )
          );

          break;
        }

        default: {
          if (isDevelopmentEnvironment()) {
            switch (message.type) {
              case "debug-update-client": {
                const { historyCursor } =
                  message.payload as DebugClientUpdateMessage["payload"];

                const manager = getManager();
                await manager
                  .createQueryBuilder()
                  .update(Client, {
                    historyCursor: historyCursor,
                  })
                  .where({
                    uid: clientId,
                  })
                  .execute();

                reply(message, new ControlMessage());
                break;
              }

              default: {
                replyUnrecognizedMessage(message);
              }
            }
          } else {
            replyUnrecognizedMessage(message);
          }
        }
      }

      const syncRecentOngoing = (): boolean => {
        return syncStatus.client2server["sync-recent-processing"];
      };

      const syncFullOngoing = (): boolean => {
        return (
          syncStatus.server2client["sync-full-meta-query-count"] >
          syncStatus.client2server["sync-full-entries-response-count"]
        );
      };

      const syncFullSucceed = (): boolean => {
        return (
          syncStatus.server2client["sync-full-meta-query-count"] <=
          syncStatus.client2server["sync-full-entries-response-count"]
        );
      };

      // If we are not syncing anything from client, then say goodbye to client
      if (!syncRecentOngoing() && !syncFullOngoing()) {
        send(new ClientServerGoodbyeMessage());
        syncStatus.server2client.goodbye = true;
      }

      // If both client and server have said goodbye, do cleanup and disconnect
      if (
        syncStatus.client2server.goodbye &&
        syncStatus.server2client.goodbye
      ) {
        socket.close();

        // If a sync-full has completed successfully,
        // update cursor so that next sync could be accelerated.
        if (
          syncFullSucceed() &&
          syncStatus.client2server["cursor-when-sync-full-started"]
        ) {
          await clientService.updateClientHistoryCursor(
            userId,
            clientId,
            syncStatus.client2server["cursor-when-sync-full-started"]
          );
        }
      }
    });
  });
}

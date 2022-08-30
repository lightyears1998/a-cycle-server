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
import { History } from "../entity/history";
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
      },
      client2server: {
        "recent-sync-processing": false,
        "full-sync-processing": false,
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

        syncStatus.client2server["recent-sync-processing"] = true;

        send(new SynchronizationModeRecentRequestMessage(client.historyCursor));
      } else {
        logger(
          "Client record not found, record this client and then perform a full-sync."
        );
        syncStatus.client2server["full-sync-processing"] = true;

        const client = manager.create(Client, {
          uid: clientId,
          user: {
            id: userId,
          },
        });
        await manager.save(client);

        // todo
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
            syncStatus.client2server["recent-sync-processing"] = false;
            syncStatus.client2server["full-sync-processing"] = true;
            return;
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
            syncStatus.client2server["recent-sync-processing"] = false;
          } else {
            // Continue to request client for sync-recent with lastest histroy cursor
            send(new SynchronizationModeRecentRequestMessage(historyCursor));
          }

          break;
        }

        case "sync-full-meta-query": {
          break;
        }

        case "sync-full-meta-response": {
          break;
        }

        case "sync-full-entries-query": {
          break;
        }

        case "sync-full-entries-response": {
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

      // If we are not sync from client, then say goodbye to client
      if (
        !syncStatus.client2server["full-sync-processing"] &&
        !syncStatus.client2server["recent-sync-processing"]
      ) {
        send(new ClientServerGoodbyeMessage());
        syncStatus.server2client.goodbye = true;
      }

      // If both client and server have said goodbye, do cleanup and disconnect
      if (
        syncStatus.client2server.goodbye &&
        syncStatus.server2client.goodbye
      ) {
        socket.close();
      }
    });
  });
}

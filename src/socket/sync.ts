import { AuthenticatedWebSocket } from "./authentication";
import { isDevelopmentEnvironment } from "../util";
import {
  ClientServerGoodbyeMessage,
  ControlMessage,
  DebugNodeUpdateMessage,
  Message,
  SynchronizationModeFullEntriesQuery,
  SynchronizationModeFullEntriesResponse,
  SynchronizationModeFullMetaQuery,
  SynchronizationModeFullMetaResponse,
  SynchronizationModeRecentRequestMessage,
  SynchronizationModeRecentResponseMessage,
} from "./message";
import { Container } from "typedi";
import { TRANSMISSION_PAGING_SIZE } from "../env";
import { BadParameterError, HistoryCursorInvalidError } from "../error";
import { getManager } from "../db";
import { Node } from "../entity/node";
import { EntryHistory, HistoryCursor } from "../entity/entry-history";
import { HistoryService } from "../service/history";
import { In, MoreThan } from "typeorm";
import { Entry } from "../entity/entry";
import { NodeService } from "../service/node";
import { EntryService } from "../service/entry";
import { UserService } from "../service/user";

const manager = getManager();
const userService = Container.get(UserService);
const entryService = Container.get(EntryService);
const historyService = Container.get(HistoryService);
const nodeService = Container.get(NodeService);

export async function syncEntriesViaSocket(socket: AuthenticatedWebSocket) {
  const { serverUuid, userId, nodeUuid } = socket.authState;

  const syncState = {
    s2c: {
      "said-goodbye": false,
      "sync-full-meta-query-count": 0,
    },
    c2s: {
      "sync-recent-processing": false,
      "sync-full-entries-response-count": 0,
      "cursor-when-sync-full-started": null as HistoryCursor | null,
      "said-goodbye": false,
    },
  };

  // Request entries synchronization from client to server
  {
    const node = await manager.findOne(Node, {
      where: { uuid: nodeUuid },
    });
    if (node) {
      socket.log("Node record found, performing a recent-sync.");

      syncState.c2s["sync-recent-processing"] = true;

      socket.sendMessage(
        new SynchronizationModeRecentRequestMessage(node.historyCursor)
      );
    } else {
      socket.log(
        "Node record not found, recording this node and performing a full-sync."
      );
      syncState.s2c["sync-full-meta-query-count"]++;

      const client = manager.create(Node, {
        uuid: nodeUuid,
        user: {
          id: userId,
        },
      });
      await manager.save(client);

      socket.sendMessage(new SynchronizationModeFullMetaQuery(0));
    }
  }

  socket.on("message", async (data) => {
    let message: Message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      if (err instanceof SyntaxError) {
        socket.send(
          new ControlMessage([new BadParameterError("Bad JSON syntax.")])
        );
        socket.close();
        return;
      } else {
        socket.log(err);
        throw err;
      }
    }

    if (typeof message.session !== "string" || message.session === "") {
      socket.send(
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
        socket.replyMessage(
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
        const history = await historyService.locateHistoryCursor(historyCursor);
        if (!history) {
          // Broken history cursor, which indicates client to fall back to full sync.
          socket.replyMessage(
            message,
            new ControlMessage([new HistoryCursorInvalidError()])
          );
          break;
        }

        // Valid history cursor, get histories after that cursor and send relating entries to client
        const histories = await manager.find(EntryHistory, {
          where: {
            id: MoreThan(history.id),
          },
          order: {
            id: "ASC",
          },
          take: TRANSMISSION_PAGING_SIZE,
        });
        const nextHistroyCursor = histories[histories.length - 1];

        const entries = await manager.find(Entry, {
          where: {
            uuid: In(histories.map((history) => history.entryId)),
          },
        });
        const plainEntries = entries.map((entry) => entry.toPlain());

        socket.replyMessage(
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
          syncState.c2s["sync-recent-processing"] = false;
          syncState.s2c["sync-full-meta-query-count"]++;
          socket.sendMessage(new SynchronizationModeFullMetaQuery(0));

          break;
        }

        const { historyCursor, entries } =
          message.payload as SynchronizationModeRecentResponseMessage["payload"];

        await Promise.allSettled(
          entries.map((entry) => {
            return entryService.updateEntryIfFresher(userId, entry);
          })
        );
        await nodeService.updateClientHistoryCursor(
          userId,
          nodeUuid,
          historyCursor
        );

        if (entries.length === 0) {
          // If `entries` are empty, we must reach the end of history and sync-recent has completed.
          syncState.c2s["sync-recent-processing"] = false;
        } else {
          // Continue to request client for sync-recent with lastest histroy cursor
          socket.sendMessage(
            new SynchronizationModeRecentRequestMessage(historyCursor)
          );
        }

        break;
      }

      case "sync-full-meta-query": {
        const { skip } = (message as SynchronizationModeFullMetaQuery).payload;
        const cursor = await historyService.getLastestCursor(userId);
        const entries = await manager.find(Entry, {
          where: {
            user: {
              id: userId,
            },
          },
          skip: skip,
          take: TRANSMISSION_PAGING_SIZE,
        });
        const meta = entries.map((entry) => entry.getMetadata());

        socket.replyMessage(
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
          syncState.c2s["cursor-when-sync-full-started"] = currentCursor;
        }

        if (!syncState.c2s["cursor-when-sync-full-started"] && currentCursor) {
          syncState.c2s["cursor-when-sync-full-started"] = currentCursor;
        }

        if (entryMetadata.length === 0) {
          break;
        }

        const fresherEntryMetadata =
          await entryService.filterFresherEntryMetadata(entryMetadata);
        socket.sendMessage(
          new SynchronizationModeFullEntriesQuery(
            fresherEntryMetadata.map((meta) => meta.uuid)
          )
        );

        break;
      }

      case "sync-full-entries-query": {
        const { uuids: uuids } = (
          message as SynchronizationModeFullEntriesQuery
        ).payload;

        const entries = await manager.find(Entry, {
          where: {
            uuid: In(uuids),
            user: {
              id: userId,
            },
          },
        });

        const plainEntries = entries.map((entry) => entry.toPlain());

        socket.replyMessage(
          message,
          new SynchronizationModeFullEntriesResponse(plainEntries)
        );
      }

      case "sync-full-entries-response": {
        const { entries } = (message as SynchronizationModeFullEntriesResponse)
          .payload;
        syncState.c2s["sync-full-entries-response-count"]++;

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
                message.payload as DebugNodeUpdateMessage["payload"];

              const manager = getManager();
              await manager
                .createQueryBuilder()
                .update(Node, {
                  historyCursor: historyCursor,
                })
                .where({
                  uuid: nodeUuid,
                })
                .execute();

              socket.replyMessage(message, new ControlMessage());
              break;
            }

            default: {
              socket.replyUnrecognizedMessage(message);
            }
          }
        } else {
          socket.replyUnrecognizedMessage(message);
        }
      }
    }

    const syncRecentOngoing = (): boolean => {
      return syncState.c2s["sync-recent-processing"];
    };

    const syncFullOngoing = (): boolean => {
      return (
        syncState.s2c["sync-full-meta-query-count"] >
        syncState.c2s["sync-full-entries-response-count"]
      );
    };

    const syncFullSucceed = (): boolean => {
      return (
        syncState.s2c["sync-full-meta-query-count"] <=
        syncState.c2s["sync-full-entries-response-count"]
      );
    };

    // If we are not syncing anything from client, then say goodbye to client
    if (!syncRecentOngoing() && !syncFullOngoing()) {
      socket.sendMessage(new ClientServerGoodbyeMessage());
      syncState.s2c["said-goodbye"] = true;
    }

    // If both client and server have said goodbye, do cleanup and disconnect
    if (syncState.c2s["said-goodbye"] && syncState.s2c["said-goodbye"]) {
      socket.close();

      // If a sync-full has completed successfully,
      // update cursor so that next sync could be accelerated.
      if (syncFullSucceed() && syncState.c2s["cursor-when-sync-full-started"]) {
        await nodeService.updateClientHistoryCursor(
          userId,
          nodeUuid,
          syncState.c2s["cursor-when-sync-full-started"]
        );
      }
    }
  });
}

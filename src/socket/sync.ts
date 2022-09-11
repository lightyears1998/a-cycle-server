import { AuthenticatedWebSocket } from "./authentication";
import {
  GoodbyeMessage,
  ControlMessage,
  DebugNodeUpdateMessage,
  Message,
  SyncModeFullEntriesQueryMessage,
  SyncModeFullEntriesResponseMessage,
  SyncModeFullMetaQueryMessage,
  SyncModeFullMetaResponseMessage,
  SyncModeRecentRequestMessage,
  SyncModeRecentResponseMessage,
  HandshakeMessage,
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
import { RawData } from "ws";
import { checkGcInDevelopment, isDevelopmentEnvironment } from "../util";

const manager = getManager();
const entryService = Container.get(EntryService);
const historyService = Container.get(HistoryService);
const nodeService = Container.get(NodeService);

class SyncState {
  s2c = {
    "said-goodbye": false,
    "sync-full-meta-query-count": 0,
  };
  c2s = {
    "sync-recent-processing": false,
    "sync-full-entries-response-count": 0,
    "cursor-when-sync-full-started": null as HistoryCursor | null,
    "said-goodbye": false,
  };

  syncRecentOngoing = (): boolean => {
    return this.c2s["sync-recent-processing"];
  };

  syncFullOngoing = (): boolean => {
    return (
      this.s2c["sync-full-meta-query-count"] >
      this.c2s["sync-full-entries-response-count"]
    );
  };

  syncFullSucceed = (): boolean => {
    return (
      this.s2c["sync-full-meta-query-count"] <=
        this.c2s["sync-full-entries-response-count"] &&
      this.s2c["sync-full-meta-query-count"] >= 0
    );
  };
}

type MessageHandler = (socket: SyncingWebSocket, message: any) => Promise<void>;

type SyncingWebSocket = AuthenticatedWebSocket & {
  syncState: SyncState;
  handlers: Map<string, MessageHandler>;
};

function parseMessage(socket: SyncingWebSocket, data: RawData): Message | null {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch (err) {
    if (err instanceof SyntaxError) {
      socket.sendMessage(
        new ControlMessage([new BadParameterError("Bad JSON syntax.")])
      );
      socket.close();
      return null;
    } else {
      socket.log(err);
      throw err;
    }
  }

  if (typeof message.session !== "string" || message.session === "") {
    socket.sendMessage(
      new ControlMessage([
        new BadParameterError(
          "Messsage should contain an non-empty session of string type."
        ),
      ])
    );
    socket.close();
    return null;
  }

  if (!message.type) {
    socket.replyMessage(
      message,
      new ControlMessage([
        new BadParameterError(
          "Each message must contain a valid `type` field."
        ),
      ])
    );
    return null;
  }

  return message;
}

/** Request entries synchronization from client to server */
async function initClient2ServerSync(socket: SyncingWebSocket) {
  const { userId, nodeUuid } = socket.authState;

  const node = await manager.findOne(Node, {
    where: { uuid: nodeUuid },
  });
  if (node) {
    socket.log("Node record found, performing a recent-sync.");
    socket.syncState.c2s["sync-recent-processing"] = true;
    socket.sendMessage(new SyncModeRecentRequestMessage(node.historyCursor));
  } else {
    socket.log(
      "Node record not found, recording this node and performing a full-sync."
    );
    socket.syncState.s2c["sync-full-meta-query-count"]++;

    const client = manager.create(Node, {
      uuid: nodeUuid,
      user: {
        id: userId,
      },
    });
    await manager.save(client);

    socket.sendMessage(new SyncModeFullMetaQueryMessage(0));
  }
}

export async function syncEntriesViaSocket(socket: AuthenticatedWebSocket) {
  const syncingSocket = socket as SyncingWebSocket;
  syncingSocket.syncState = new SyncState();
  syncingSocket.handlers = new Map();

  try {
    await doSync(syncingSocket);
  } catch (err) {
    socket.log(err);
    socket.log("Sync aborted due to error.");
  }
}

const controlMessageHandler: MessageHandler = async (
  _socket,
  _message: ControlMessage
) => {
  return; // Do nothing
};

const handshakeMessageHandler: MessageHandler = async (
  _socket,
  _message: HandshakeMessage
) => {
  return; // Do nothing
};

const goodbyeMessageHandler: MessageHandler = async (
  socket,
  _message: GoodbyeMessage
) => {
  socket.syncState.c2s["said-goodbye"] = true;
};

const syncModeRecentRequestMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeRecentRequestMessage
) => {
  const { userId } = socket.authState;
  const { historyCursor } = message.payload;

  const rejectInvalidCursor = () => {
    const errorMessage = new SyncModeRecentResponseMessage(null, []);
    errorMessage.errors.push(new HistoryCursorInvalidError());
    socket.replyMessage(message, errorMessage);
  };

  if (!historyCursor) {
    // Invalid history cursor
    rejectInvalidCursor();
    return;
  }

  const history = await historyService.locateHistoryCursorOfUser(
    historyCursor,
    userId
  );
  if (!history) {
    // Broken history cursor, which indicates client to fall back to full sync.
    rejectInvalidCursor();
    return;
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
      uuid: In(histories.map((history) => history.entryUuid)),
    },
  });
  const plainEntries = entries.map((entry) => entry.toPlain());

  socket.replyMessage(
    message,
    new SyncModeRecentResponseMessage(nextHistroyCursor, plainEntries)
  );
};

const syncModeRecentResponseMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeRecentResponseMessage
) => {
  const { userId, nodeUuid } = socket.authState;

  // Check errors
  const errors = message.errors;
  if (errors.length > 0) {
    // If errors, sync-recent won't work.
    // We have to fallback to sync-full.
    socket.syncState.c2s["sync-recent-processing"] = false;
    socket.syncState.s2c["sync-full-meta-query-count"]++;
    socket.sendMessage(new SyncModeFullMetaQueryMessage(0));

    return;
  }

  const { historyCursor, entries } = message.payload;

  if (historyCursor) {
    await nodeService.updateClientHistoryCursor(
      userId,
      nodeUuid,
      historyCursor
    );
  }

  await Promise.allSettled(
    entries.map((entry) => {
      return entryService.saveEntryIfNewOrFresher(userId, entry);
    })
  );

  if (entries.length === 0) {
    // If `entries` are empty, we must reach the end of history and sync-recent has completed.
    socket.syncState.c2s["sync-recent-processing"] = false;
  } else {
    // Continue to request client for sync-recent with lastest histroy cursor
    socket.sendMessage(new SyncModeRecentRequestMessage(historyCursor));
  }

  return;
};

const syncModeFullMetaQueryMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeFullMetaQueryMessage
) => {
  const { userId } = socket.authState;
  const { skip } = message.payload;

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
    new SyncModeFullMetaResponseMessage(skip, cursor, meta)
  );

  return;
};

const syncModeFullMetaResponseMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeFullMetaResponseMessage
) => {
  const { skip, currentCursor, entryMetadata } = message.payload;

  if (currentCursor) {
    if (skip === 0 || !socket.syncState.c2s["cursor-when-sync-full-started"]) {
      socket.syncState.c2s["cursor-when-sync-full-started"] = currentCursor;
    }
  }

  if (entryMetadata.length === 0) {
    return;
  }

  socket.sendMessage(
    new SyncModeFullMetaQueryMessage(skip + entryMetadata.length)
  );
  socket.syncState.s2c["sync-full-meta-query-count"]++;

  const fresherEntryMetadata = await entryService.filterFresherEntryMetadata(
    entryMetadata
  );
  socket.sendMessage(
    new SyncModeFullEntriesQueryMessage(
      fresherEntryMetadata.map((meta) => meta.uuid)
    )
  );

  return;
};

const syncModeFullEntriesQueryMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeFullEntriesQueryMessage
) => {
  const { userId } = socket.authState;
  const { uuids: uuids } = message.payload;

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
    new SyncModeFullEntriesResponseMessage(plainEntries)
  );
};

const syncModeFullEntriesResponseMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeFullEntriesResponseMessage
) => {
  const { userId } = socket.authState;
  const { entries } = message.payload;

  socket.syncState.c2s["sync-full-entries-response-count"]++;

  await Promise.allSettled(
    entries.map((entry) => entryService.saveEntryIfNewOrFresher(userId, entry))
  );

  return;
};

const debugNodeUpdateMessageHandler: MessageHandler = async (
  socket,
  message: DebugNodeUpdateMessage
) => {
  const { nodeUuid } = socket.authState;
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
  return;
};

async function cleanUpAfterSyncFull(socket: SyncingWebSocket) {
  const { userId, nodeUuid } = socket.authState;

  // If a sync-full has completed successfully,
  // update cursor so that next sync could be accelerated.
  if (
    socket.syncState.syncFullSucceed() &&
    socket.syncState.c2s["cursor-when-sync-full-started"]
  ) {
    await nodeService.updateClientHistoryCursor(
      userId,
      nodeUuid,
      socket.syncState.c2s["cursor-when-sync-full-started"]
    );
  }
}

export async function doSync(socket: SyncingWebSocket) {
  initClient2ServerSync(socket);

  const { handlers } = socket;

  const type2Handlers = [
    ["ctrl", controlMessageHandler],
    ["handshake", handshakeMessageHandler],
    ["goodbye", goodbyeMessageHandler],
    ["sync-recent-request", syncModeRecentRequestMessageHandler],
    ["sync-recent-response", syncModeRecentResponseMessageHandler],
    ["sync-full-meta-query", syncModeFullMetaQueryMessageHandler],
    ["sync-full-meta-response", syncModeFullMetaResponseMessageHandler],
    ["sync-full-entries-query", syncModeFullEntriesQueryMessageHandler],
    ["sync-full-entries-response", syncModeFullEntriesResponseMessageHandler],
  ] as [string, MessageHandler][];

  if (isDevelopmentEnvironment()) {
    type2Handlers.push(["debug-node-update", debugNodeUpdateMessageHandler]);
  }

  for (const [type, handler] of type2Handlers) {
    handlers.set(type, handler);
  }

  socket.on("message", async (data) => {
    const message = parseMessage(socket, data);
    if (!message) {
      return;
    }

    // Dispatch message to handler accroding to its type.
    const handler = handlers.get(message.type);
    if (handler) {
      await handler(socket, message);
    } else {
      socket.replyUnrecognizedMessage(message);
    }

    // If we are not syncing anything from client, then say goodbye to client
    if (
      !socket.syncState.syncRecentOngoing() &&
      !socket.syncState.syncFullOngoing()
    ) {
      socket.sendMessage(new GoodbyeMessage());
      socket.syncState.s2c["said-goodbye"] = true;
    }

    // If both client and server have said goodbye, disconnect and cleanup.
    if (
      socket.syncState.c2s["said-goodbye"] &&
      socket.syncState.s2c["said-goodbye"]
    ) {
      socket.close();
      await cleanUpAfterSyncFull(socket);
      checkGcInDevelopment(socket);
    }
  });
}

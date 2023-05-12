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
import { EntryHistory } from "../entity/entry-history";
import { HistoryService } from "../service/history";
import { In, MoreThan } from "typeorm";
import { Entry } from "../entity/entry";
import { NodeService } from "../service/node";
import { EntryService } from "../service/entry";
import { RawData } from "ws";
import {
  checkGcInDevelopmentEnvironment,
  isDevelopmentEnvironment,
} from "../util";
import { SyncState } from "./sync-state";

const manager = getManager();
const entryService = Container.get(EntryService);
const historyService = Container.get(HistoryService);
const nodeService = Container.get(NodeService);

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

/** Sync entries from peer node, ie. client to server. */
async function initSyncFromPeerNode(socket: SyncingWebSocket) {
  const { userId, nodeUuid } = socket.authState;

  socket.log("Initializing synchronization from peer node.");

  socket.log("Looking up for node sync record.");
  const node = await manager.findOne(Node, {
    where: { uuid: nodeUuid },
  });

  if (node) {
    socket.log("Node sync record found, performing a recent-sync.");
    const session = socket.sendMessage(
      new SyncModeRecentRequestMessage(node.historyCursor)
    );
    socket.log(
      `Sending SyncModeRecentRequestMessage #${++socket.syncState.sent[
        "sync-recent-request-count"
      ]} [${session}].`
    );
  } else {
    socket.log(
      "No node record found, recording this node and performing a full-sync."
    );

    const client = manager.create(Node, {
      uuid: nodeUuid,
      user: {
        id: userId,
      },
    });
    await manager.save(client);

    const session = socket.sendMessage(new SyncModeFullMetaQueryMessage(0));
    socket.log(
      `Sending SyncModeFullMetaQueryMessage #${++socket.syncState.sent[
        "sync-full-meta-query-count"
      ]} [${session}].`
    );
  }

  socket.syncState.hasSyncBegun = true;
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
  socket.syncState.received["goodbye"] = true;
  socket.log("Receiving goodbye message from client.");
};

const syncModeRecentRequestMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeRecentRequestMessage
) => {
  const { userId } = socket.authState;
  const { historyCursor } = message.payload;

  socket.log(`Receiving SyncModeRecentRequestMessage.`);

  const rejectInvalidCursor = () => {
    const errorMessage = new SyncModeRecentResponseMessage(null, []);
    errorMessage.errors.push(new HistoryCursorInvalidError());
    socket.replyMessage(message, errorMessage);
  };

  if (!historyCursor) {
    // Invalid history cursor
    rejectInvalidCursor();
    socket.log("History cursor is empty, rejecting.");
    return;
  }

  const history = await historyService.locateHistoryCursorOfUser(
    historyCursor,
    userId
  );
  if (!history) {
    // Broken history cursor, which indicates client to fall back to full sync.
    socket.log("History cursor mismatched, rejecting.");
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
  const nextHistroyCursor =
    histories.length > 0 ? histories[histories.length - 1] : historyCursor;

  const entries =
    histories.length > 0
      ? await manager.find(Entry, {
          where: {
            uuid: In(histories.map((history) => history.entryUuid)),
          },
        })
      : [];
  const plainEntries = entries.map((entry) => entry.toPlain());

  socket.replyMessage(
    message,
    new SyncModeRecentResponseMessage(nextHistroyCursor, plainEntries)
  );
  socket.log("Replying SyncModeRecentResponseMessage.");
};

const syncModeRecentResponseMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeRecentResponseMessage
) => {
  const { session } = message;
  const { userId, nodeUuid } = socket.authState;

  socket.log(
    `Receiving SyncModeRecentResponseMessage #${++socket.syncState.received[
      "sync-recent-response-count"
    ]} [${session}].`
  );

  // Check errors
  const errors = message.errors;
  if (errors.length > 0) {
    // If errors, sync-recent won't work.
    // We have to fallback to sync-full.
    socket.log(`Sync-recent failed due to errors: ${errors.join(" ")}.`);
    socket.log("Fallback to sync-full.");

    const session = socket.sendMessage(new SyncModeFullMetaQueryMessage(0));
    socket.log(
      `Sending SyncModeFullMetaQueryMessage #${++socket.syncState.sent[
        "sync-full-meta-query-count"
      ]} [${session}].`
    );
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
    socket.log(
      `Entries payload of received SyncModeFullMetaQueryMessage is empty. Sync-recent finishes.`
    );
  } else {
    // Continue to request client for sync-recent with lastest histroy cursor
    const session = socket.sendMessage(
      new SyncModeRecentRequestMessage(historyCursor)
    );
    socket.log(
      `Sending SyncModeRecentRequestMessage #${++socket.syncState.sent[
        "sync-recent-request-count"
      ]} [${session}].`
    );
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
  const { session } = message;
  const { skip, currentCursor, entryMetadata } = message.payload;

  socket.log(
    `Receiving SyncModeFullMetaResponseMessage #${++socket.syncState.received[
      "sync-full-meta-response-count"
    ]} [${session}].`
  );

  if (currentCursor) {
    if (!socket.syncState.received["sync-full-entries-response-first-cursor"]) {
      socket.syncState.received["sync-full-entries-response-first-cursor"] =
        currentCursor;
      socket.log(
        "Updating cursor from received SyncModeFullMetaResponseMessage."
      );
    }
  }

  if (entryMetadata.length === 0) {
    socket.log("No entry metadata received. Sync-full finished.");
    return;
  }

  const metaQueryMessageSession = socket.sendMessage(
    new SyncModeFullMetaQueryMessage(skip + entryMetadata.length)
  );
  socket.log(
    `Sending SyncModeFullMetaQueryMessage #${++socket.syncState.sent[
      "sync-full-meta-query-count"
    ]} [${metaQueryMessageSession}].`
  );

  const fresherEntryMetadata = await entryService.filterFresherEntryMetadata(
    entryMetadata
  );
  const entriesQuerySession = socket.sendMessage(
    new SyncModeFullEntriesQueryMessage(
      fresherEntryMetadata.map((meta) => meta.uuid)
    )
  );
  socket.log(
    `Sending SyncModeFullEntriesQueryMessage #${++socket.syncState.sent[
      "sync-full-entries-query-count"
    ]} [${entriesQuerySession}].`
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
  socket.log("Sending SyncModeFullEntriesResponseMessage.");
};

const syncModeFullEntriesResponseMessageHandler: MessageHandler = async (
  socket,
  message: SyncModeFullEntriesResponseMessage
) => {
  const { userId } = socket.authState;
  const { session } = message;
  const { entries } = message.payload;

  socket.log(
    `Receiving SyncModeFullEntriesResponseMessage #${++socket.syncState
      .received["sync-full-entries-response-count"]} [${session}].`
  );

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
  if (socket.syncState.isSyncFullExecuted()) {
    if (
      socket.syncState.isSyncFullSucceed() &&
      socket.syncState.received["sync-full-entries-response-first-cursor"]
    ) {
      await nodeService.updateClientHistoryCursor(
        userId,
        nodeUuid,
        socket.syncState.received["sync-full-entries-response-first-cursor"]
      );
      socket.log("Sync full succeed and cursor is updated.");
    } else {
      socket.log(
        "Sync full has failed or no cursor was submitted by client, and hence no cursor is updated."
      );
    }
  }
}

export async function doSync(socket: SyncingWebSocket) {
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
      socket.syncState.processingMessageCount++;
      await handler(socket, message);
      socket.syncState.processingMessageCount--;
    } else {
      socket.replyUnrecognizedMessage(message);
      socket.log(`Unable to recognize client message type: ${message.type}.`);
    }

    // If we are not syncing anything from client, then say goodbye to client.
    if (
      socket.syncState.hasSyncBegun &&
      socket.syncState.processingMessageCount === 0 &&
      !socket.syncState.isSyncRecentOngoing() &&
      !socket.syncState.isSyncFullOngoing() &&
      !socket.syncState.sent["goodbye"]
    ) {
      socket.sendMessage(new GoodbyeMessage());
      socket.syncState.sent["goodbye"] = true;
      cleanUpAfterSyncFull(socket);
      socket.log(
        "We are not syncing anything from client, and it's time to say goodbye."
      );
    }

    // If both client and server have said goodbye, then disconnect.
    if (
      socket.syncState.processingMessageCount === 0 &&
      socket.syncState.received["goodbye"] &&
      socket.syncState.sent["goodbye"]
    ) {
      if (!socket.syncState.isClosing) {
        socket.syncState.isClosing = true;

        socket.close();
        socket.log("Two-way synchronization finished.");

        setTimeout(() => checkGcInDevelopmentEnvironment(socket), 10000);
      }
    }
  });

  socket.on("close", () => {
    socket.log("Socket is closed.");
  });

  await initSyncFromPeerNode(socket);
}

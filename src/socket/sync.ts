import { AuthenticatedWebSocket } from "./authentication";
import {
  GoodbyeMessage,
  ControlMessage,
  DebugNodeUpdateMessage,
  SyncModeFullEntriesQueryMessage,
  SyncModeFullEntriesResponseMessage,
  SyncModeFullMetaQueryMessage,
  SyncModeFullMetaResponseMessage,
  SyncModeRecentRequestMessage,
  SyncModeRecentResponseMessage,
  HandshakeMessage,
  Message,
} from "./message";
import { Container } from "typedi";
import { TRANSMISSION_PAGING_SIZE } from "../env";
import { HistoryCursorInvalidError } from "../error";
import { getManager } from "../db";
import { Node } from "../entity/node";
import { EntryHistory } from "../entity/entry-history";
import { HistoryService } from "../service/history";
import { In, MoreThan } from "typeorm";
import { Entry } from "../entity/entry";
import { NodeService } from "../service/node";
import { EntryService } from "../service/entry";
import {
  checkGcInDevelopmentEnvironment,
  isDevelopmentEnvironment,
} from "../utils";
import { SyncState } from "./sync-state";
import { parseMessage } from "./sync-utils";
import { SyncService } from "./sync-service";

export type MessageHandler = (
  this: SyncingWebSocket,
  message: any
) => Promise<void>;

const handlers: Map<string, MessageHandler> = new Map();

export type SyncingWebSocket = AuthenticatedWebSocket & {
  state: SyncState;
  service: SyncService;
};

/** Sync entries from peer node, ie. client to server. */
async function initSyncFromPeerNode(this: SyncingWebSocket) {
  const { userId, nodeUuid } = this.authState;

  this.log("Initializing synchronization from peer node.");

  this.log("Looking up for node sync record.");
  const node = await this.service.manager.findOne(Node, {
    where: { uuid: nodeUuid },
  });

  if (node) {
    this.log("Node sync record found, performing a recent-sync.");
    const session = this.sendMessage(
      new SyncModeRecentRequestMessage(node.historyCursor)
    );
    this.log(
      `Sending SyncModeRecentRequestMessage #${++this.state.sent[
        "sync-recent-request-count"
      ]} [${session}].`
    );
  } else {
    this.log(
      "No node record found, recording this node and performing a full-sync."
    );

    const client = this.service.manager.create(Node, {
      uuid: nodeUuid,
      user: {
        id: userId,
      },
    });
    await this.service.manager.save(client);

    const session = this.sendMessage(new SyncModeFullMetaQueryMessage(0));
    this.log(
      `Sending SyncModeFullMetaQueryMessage #${++this.state.sent[
        "sync-full-meta-query-count"
      ]} [${session}].`
    );
  }

  this.state.hasSyncBegun = true;
}

export function buildSyncingWebSocket(
  socket: AuthenticatedWebSocket
): SyncingWebSocket {
  const syncingSocket = socket as SyncingWebSocket;
  syncingSocket.state = new SyncState();

  return syncingSocket;
}

export async function syncEntries(socket: SyncingWebSocket) {
  try {
    await doSync(socket);
  } catch (err) {
    socket.log(err);
    socket.log("Sync aborted due to error.");
  }
}

export function controlMessageHandler(
  this: SyncingWebSocket,
  _message: ControlMessage
) {
  return; // Do nothing
}

export function handshakeMessageHandler(
  this: SyncingWebSocket,
  _message: HandshakeMessage
) {
  return; // Do nothing
}

export function goodbyeMessageHandler(
  this: SyncingWebSocket,
  _message: GoodbyeMessage
) {
  this.state.received["goodbye"] = true;
  this.log("Receiving goodbye message from client.");
}

export async function syncModeRecentRequestMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeRecentRequestMessage
) {
  const { userId } = this.authState;
  const { historyCursor } = message.payload;

  this.log(`Receiving SyncModeRecentRequestMessage.`);

  const rejectInvalidCursor = () => {
    const errorMessage = new SyncModeRecentResponseMessage(null, []);
    errorMessage.errors.push(new HistoryCursorInvalidError());
    this.replyMessage(message, errorMessage);
  };

  if (!historyCursor) {
    // Invalid history cursor
    rejectInvalidCursor();
    this.log("History cursor is empty, rejecting.");
    return;
  }

  const history = await this.service.history.locateHistoryCursorOfUser(
    historyCursor,
    userId
  );
  if (!history) {
    // Broken history cursor, which indicates client to fall back to full sync.
    this.log("History cursor mismatched, rejecting.");
    rejectInvalidCursor();
    return;
  }

  // Valid history cursor, get histories after that cursor and send relating entries to client
  const histories = await this.service.manager.find(EntryHistory, {
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
      ? await this.service.manager.find(Entry, {
          where: {
            uuid: In(histories.map((history) => history.entryUuid)),
          },
        })
      : [];
  const plainEntries = entries.map((entry) => entry.toPlain());

  this.replyMessage(
    message,
    new SyncModeRecentResponseMessage(nextHistroyCursor, plainEntries)
  );
  this.log("Replying SyncModeRecentResponseMessage.");
}

async function syncModeRecentResponseMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeRecentResponseMessage
) {
  const { session } = message;
  const { userId, nodeUuid } = this.authState;

  this.log(
    `Receiving SyncModeRecentResponseMessage #${++this.state.received[
      "sync-recent-response-count"
    ]} [${session}].`
  );

  // Check errors
  const errors = message.errors;
  if (errors.length > 0) {
    // If errors, sync-recent won't work.
    // We have to fallback to sync-full.
    this.log(`Sync-recent failed due to errors: ${errors.join(" ")}.`);
    this.log("Fallback to sync-full.");

    const session = this.sendMessage(new SyncModeFullMetaQueryMessage(0));
    this.log(
      `Sending SyncModeFullMetaQueryMessage #${++this.state.sent[
        "sync-full-meta-query-count"
      ]} [${session}].`
    );
    return;
  }

  const { historyCursor, entries } = message.payload;

  if (historyCursor) {
    await this.service.node.updateClientHistoryCursor(
      userId,
      nodeUuid,
      historyCursor
    );
  }

  await Promise.allSettled(
    entries.map((entry) => {
      return this.service.entry.saveEntryIfNewOrFresher(userId, entry);
    })
  );

  if (entries.length === 0) {
    // If `entries` are empty, we must reach the end of history and sync-recent has completed.
    this.log(
      `Entries payload of received SyncModeFullMetaQueryMessage is empty. Sync-recent finishes.`
    );
  } else {
    // Continue to request client for sync-recent with lastest histroy cursor
    const session = this.sendMessage(
      new SyncModeRecentRequestMessage(historyCursor)
    );
    this.log(
      `Sending SyncModeRecentRequestMessage #${++this.state.sent[
        "sync-recent-request-count"
      ]} [${session}].`
    );
  }

  return;
}

async function syncModeFullMetaQueryMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeFullMetaQueryMessage
) {
  const { userId } = this.authState;
  const { skip } = message.payload;

  const cursor = await this.service.history.getLastestCursor(userId);
  const entries = await this.service.manager.find(Entry, {
    where: {
      user: {
        id: userId,
      },
    },
    skip: skip,
    take: TRANSMISSION_PAGING_SIZE,
  });
  const meta = entries.map((entry) => entry.getMetadata());

  this.replyMessage(
    message,
    new SyncModeFullMetaResponseMessage(skip, cursor, meta)
  );

  return;
}

async function syncModeFullMetaResponseMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeFullMetaResponseMessage
) {
  const { session } = message;
  const { skip, currentCursor, entryMetadata } = message.payload;

  this.log(
    `Receiving SyncModeFullMetaResponseMessage #${++this.state.received[
      "sync-full-meta-response-count"
    ]} [${session}].`
  );

  if (currentCursor) {
    if (!this.state.received["sync-full-entries-response-first-cursor"]) {
      this.state.received["sync-full-entries-response-first-cursor"] =
        currentCursor;
      this.log(
        "Updating cursor from received SyncModeFullMetaResponseMessage."
      );
    }
  }

  if (entryMetadata.length === 0) {
    this.log("No entry metadata received. Sync-full finished.");
    return;
  }

  const metaQueryMessageSession = this.sendMessage(
    new SyncModeFullMetaQueryMessage(skip + entryMetadata.length)
  );
  this.log(
    `Sending SyncModeFullMetaQueryMessage #${++this.state.sent[
      "sync-full-meta-query-count"
    ]} [${metaQueryMessageSession}].`
  );

  const fresherEntryMetadata =
    await this.service.entry.filterFresherEntryMetadata(entryMetadata);
  const entriesQuerySession = this.sendMessage(
    new SyncModeFullEntriesQueryMessage(
      fresherEntryMetadata.map((meta) => meta.uuid)
    )
  );
  this.log(
    `Sending SyncModeFullEntriesQueryMessage #${++this.state.sent[
      "sync-full-entries-query-count"
    ]} [${entriesQuerySession}].`
  );

  return;
}

async function syncModeFullEntriesQueryMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeFullEntriesQueryMessage
) {
  const { userId } = this.authState;
  const { uuids: uuids } = message.payload;

  const entries = await this.service.manager.find(Entry, {
    where: {
      uuid: In(uuids),
      user: {
        id: userId,
      },
    },
  });

  const plainEntries = entries.map((entry) => entry.toPlain());

  this.replyMessage(
    message,
    new SyncModeFullEntriesResponseMessage(plainEntries)
  );
  this.log("Sending SyncModeFullEntriesResponseMessage.");
}

async function syncModeFullEntriesResponseMessageHandler(
  this: SyncingWebSocket,
  message: SyncModeFullEntriesResponseMessage
) {
  const { userId } = this.authState;
  const { session } = message;
  const { entries } = message.payload;

  this.log(
    `Receiving SyncModeFullEntriesResponseMessage #${++this.state.received[
      "sync-full-entries-response-count"
    ]} [${session}].`
  );

  await Promise.allSettled(
    entries.map((entry) =>
      this.service.entry.saveEntryIfNewOrFresher(userId, entry)
    )
  );

  return;
}

async function debugNodeUpdateMessageHandler(
  this: SyncingWebSocket,
  message: DebugNodeUpdateMessage
) {
  const { nodeUuid } = this.authState;
  const { historyCursor } =
    message.payload as DebugNodeUpdateMessage["payload"];

  const manager = this.service.manager;
  await manager
    .createQueryBuilder()
    .update(Node, {
      historyCursor: historyCursor,
    })
    .where({
      uuid: nodeUuid,
    })
    .execute();

  this.replyMessage(message, new ControlMessage());
  return;
}

async function cleanUpAfterSyncFull(socket: SyncingWebSocket) {
  const { userId, nodeUuid } = socket.authState;

  // If a sync-full has completed successfully,
  // update cursor so that next sync could be accelerated.
  if (socket.state.isSyncFullExecuted()) {
    if (
      socket.state.isSyncFullSucceed() &&
      socket.state.received["sync-full-entries-response-first-cursor"]
    ) {
      await socket.service.node.updateClientHistoryCursor(
        userId,
        nodeUuid,
        socket.state.received["sync-full-entries-response-first-cursor"]
      );
      socket.log("Sync full succeed and cursor is updated.");
    } else {
      socket.log(
        "Sync full has failed or no cursor was submitted by client, and hence no cursor is updated."
      );
    }
  }
}

(function installHandlers() {
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
})();

async function dispatchMessage(socket: SyncingWebSocket, message: Message) {
  const handler = handlers.get(message.type)?.bind(socket);
  if (handler) {
    socket.state.processingMessageCount++;
    await handler(message);
    socket.state.processingMessageCount--;
  } else {
    socket.replyUnrecognizedMessage(message);
    socket.log(`Unable to recognize client message type: ${message.type}.`);
  }
}

export async function doSync(socket: SyncingWebSocket) {
  socket.on("message", async (data) => {
    const message = parseMessage(socket, data);
    if (!message) {
      return;
    }

    // Dispatch message to handler accroding to its type.
    dispatchMessage(socket, message);

    // If we are not syncing anything from client, then say goodbye to client.
    if (
      socket.state.hasSyncBegun &&
      socket.state.processingMessageCount === 0 &&
      !socket.state.isSyncRecentOngoing() &&
      !socket.state.isSyncFullOngoing() &&
      !socket.state.sent["goodbye"]
    ) {
      socket.sendMessage(new GoodbyeMessage());
      socket.state.sent["goodbye"] = true;
      cleanUpAfterSyncFull(socket);
      socket.log(
        "We are not syncing anything from client, and it's time to say goodbye."
      );
    }

    // If both client and server have said goodbye, then disconnect.
    if (
      socket.state.processingMessageCount === 0 &&
      socket.state.received["goodbye"] &&
      socket.state.sent["goodbye"]
    ) {
      if (!socket.state.isClosing) {
        socket.state.isClosing = true;

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

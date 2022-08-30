import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";
import { EntryMetadata, PlainEntry } from "../entity/entry";
import { HistoryCursor } from "../entity/history";
import { ServerError } from "../error";

export abstract class Message {
  session: string = randomUUID();
  type!: string;
  errors: Array<ServerError> = [];
  payload: Record<string, unknown> = {};
  timestamp = new Date();
}

export class ControlMessage extends Message {
  type = "ctrl";

  constructor(error?: ServerError[], payload: JsonObject = {}) {
    super();
    this.errors = error || [];
    this.payload = payload;
  }
}

export class ClientServerHandshakeMessage extends Message {
  session = "client-server-connection";
  type = "cs-handshake";

  constructor(
    error: Array<ServerError>,
    serverId?: string,
    userId?: string,
    clientId?: string
  ) {
    super();
    this.errors = error;
    this.payload.serverId = serverId;
    this.payload.userId = userId;
    this.payload.clientId = clientId;
  }
}

export class ClientServerGoodbyeMessage extends Message {
  session = "client-server-connection";
  type = "cs-goodbye";
}

export class SynchronizationModeRecentRequestMessage extends Message {
  type = "sync-recent-request";
  payload = {
    historyCursor: {} as HistoryCursor,
  };

  constructor({ id, entryId, entryUpdatedAt, entryUpdatedBy }: HistoryCursor) {
    super();
    this.payload.historyCursor = {
      id,
      entryId,
      entryUpdatedAt,
      entryUpdatedBy,
    };
  }
}

export class SynchronizationModeRecentResponseMessage extends Message {
  type = "sync-recent-response";
  payload = {
    historyCursor: {} as HistoryCursor,
    entries: [] as PlainEntry[],
  };

  constructor(historyCursor: HistoryCursor, entries: PlainEntry[]) {
    super();
    this.payload.historyCursor = historyCursor;
    this.payload.entries = entries;
  }
}

export class SynchronizationModeFullMetaQuery extends Message {
  type = "sync-full-meta-query";
  payload = {
    skip: 0,
  };

  constructor(skip: number) {
    super();
    this.payload.skip = skip;
  }
}

export class SynchronizationModeFullMetaResponse extends Message {
  type = "sync-full-meta-response";
  payload = {
    currentCursor: {} as HistoryCursor,
    entryMetadata: [] as EntryMetadata[],
  };

  constructor(cursor: HistoryCursor, metadata: EntryMetadata[]) {
    super();
    this.payload.currentCursor = cursor;
    this.payload.entryMetadata = metadata;
  }
}

export class SynchronizationModeFullEntriesQuery extends Message {
  type = "sync-full-entries-query";
  payload = {
    uids: [] as Array<string>,
  };

  constructor(uids: string[]) {
    super();
    this.payload.uids = uids;
  }
}

export class SynchronizationModeFullEntriesResponse extends Message {
  type = "sync-full-entries-response";
  payload = {
    entries: [] as PlainEntry[],
  };

  constructor(entries: PlainEntry[]) {
    super();
    this.payload.entries = entries;
  }
}

/**
 * For debug only
 */
export class DebugClientUpdateMessage extends Message {
  type = "debug-client-update";
  payload = {
    historyCursor: {} as HistoryCursor,
  };
}

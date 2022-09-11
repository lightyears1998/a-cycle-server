import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";
import { EntryMetadata, PlainEntry } from "../entity/entry";
import { HistoryCursor } from "../entity/entry-history";
import { ServerError } from "../error";

export type SessionId = string;

export abstract class Message {
  session: SessionId = randomUUID();
  type!: string;
  errors: Array<ServerError> = [];
  payload: unknown = {};
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

export class HandshakeMessage extends Message {
  session = "handshake";
  type = "handshake";
  declare payload: {
    serverUuid: string | undefined;
    userId: string | undefined;
    clientUuid: string | undefined;
  };

  constructor(
    error: Array<ServerError>,
    serverUuid?: string,
    userId?: string,
    clientUuid?: string
  ) {
    super();
    this.errors = error;
    this.payload.serverUuid = serverUuid;
    this.payload.userId = userId;
    this.payload.clientUuid = clientUuid;
  }
}

export class GoodbyeMessage extends Message {
  session = "goodbye";
  type = "goodbye";
}

export class SyncModeRecentRequestMessage extends Message {
  type = "sync-recent-request";
  payload = {
    historyCursor: {} as HistoryCursor | null,
  };

  constructor(cursor: HistoryCursor | null) {
    super();
    this.payload.historyCursor = cursor;
  }
}

export class SyncModeRecentResponseMessage extends Message {
  type = "sync-recent-response";
  payload = {
    historyCursor: {} as HistoryCursor | null,
    entries: [] as PlainEntry[],
  };

  constructor(historyCursor: HistoryCursor | null, entries: PlainEntry[]) {
    super();
    this.payload.historyCursor = historyCursor;
    this.payload.entries = entries;
  }
}

export class SyncModeFullMetaQueryMessage extends Message {
  type = "sync-full-meta-query";
  payload = {
    skip: 0,
  };

  constructor(skip: number) {
    super();
    this.payload.skip = skip;
  }
}

export class SyncModeFullMetaResponseMessage extends Message {
  type = "sync-full-meta-response";
  payload = {
    skip: 0,
    currentCursor: {} as HistoryCursor | null,
    entryMetadata: [] as EntryMetadata[],
  };

  constructor(
    skip: number,
    cursor: HistoryCursor | null,
    metadata: EntryMetadata[]
  ) {
    super();
    this.payload.skip = skip;
    this.payload.currentCursor = cursor;
    this.payload.entryMetadata = metadata;
  }
}

export class SyncModeFullEntriesQueryMessage extends Message {
  type = "sync-full-entries-query";
  payload = {
    uuids: [] as Array<string>,
  };

  constructor(uuids: string[]) {
    super();
    this.payload.uuids = uuids;
  }
}

export class SyncModeFullEntriesResponseMessage extends Message {
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
export class DebugNodeUpdateMessage extends Message {
  type = "debug-node-update";
  payload = {
    historyCursor: {} as HistoryCursor,
  };
}

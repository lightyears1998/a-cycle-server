import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";
import { EntryMetadata, PlainEntry } from "../entity/entry";
import { HistoryCursor } from "../entity/entry-history";
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
    serverUuid?: string,
    userId?: string,
    clientUuid?: string
  ) {
    super();
    this.errors = error;
    this.payload.serverId = serverUuid;
    this.payload.userId = userId;
    this.payload.clientId = clientUuid;
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

export class SynchronizationModeFullEntriesQuery extends Message {
  type = "sync-full-entries-query";
  payload = {
    uuids: [] as Array<string>,
  };

  constructor(uuids: string[]) {
    super();
    this.payload.uuids = uuids;
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
export class DebugNodeUpdateMessage extends Message {
  type = "debug-node-update";
  payload = {
    historyCursor: {} as HistoryCursor,
  };
}

import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";
import { Entry } from "../entity/entry";
import type { History } from "../entity/history";
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

  constructor(error: ServerError[], payload: JsonObject = {}) {
    super();
    this.errors = error;
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

export type HistoryCursor = Pick<
  History,
  "id" | "entryId" | "entryUpdatedAt" | "entryUpdatedBy"
>;

export class SynchronizationRecentModeQueryMessage extends Message {
  type = "sync-recent-query";
  payload = {
    lastestHistory: {} as HistoryCursor,
  };

  constructor(
    session: string,
    { id: historyId, entryId, entryUpdatedAt, entryUpdatedBy }: HistoryCursor
  ) {
    super();
    this.session = session;
    this.payload.lastestHistory = {
      id: historyId,
      entryId,
      entryUpdatedAt,
      entryUpdatedBy,
    };
  }
}

export class SynchronizationRecentModeResponseMessage extends Message {
  type = "sync-recent-response";
  payload = {
    lastestHistory: {} as HistoryCursor,
    entries: [],
  };

  constructor(id: string) {
    super();
    this.session = id;
  }
}

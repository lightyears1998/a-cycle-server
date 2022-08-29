import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";
import { Entry } from "../entity/entry";
import type { History, HistoryCursor } from "../entity/history";
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

  constructor(
    session: string,
    { id, entryId, entryUpdatedAt, entryUpdatedBy }: HistoryCursor
  ) {
    super();
    this.session = session;
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
    entries: [],
  };

  constructor(id: string) {
    super();
    this.session = id;
  }
}

/**
 * For debug only
 */
export class DebugClientUpdateMessage extends Message {
  type = "debug-client-update";
  payload = {};
}

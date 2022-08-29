import { randomUUID } from "crypto";
import type { JsonObject } from "type-fest";

export abstract class Message {
  id: string = randomUUID();
  type!: string;
  error: Array<string> = [];
  payload: JsonObject = {};
}

export class ControlMessage extends Message {
  type = "ctrl";

  constructor(error: string[], payload: JsonObject = {}) {
    super();
    this.error = error;
    this.payload = payload;
  }
}

/**
 * Sent to client for once after the connection is established and user verification is passed.
 */
export class ClientServerHandshakeMessage extends Message {
  id = "cs-handshake";
  type = "cs-handshake";
  error: Array<string>;
  payload = {
    server: {
      id: "",
    } as JsonObject,
    user: {
      id: "",
    } as JsonObject,
  };

  constructor(error: Array<string>, serverId?: string, userId?: string) {
    super();
    this.error = error;
    this.payload.server.id = serverId;
    this.payload.user.id = userId;
  }
}

export class EntriesSynchronizationBeginMessage extends Message {
  type = "sync-recent-begin";

  constructor(
    id: string,
    historyId: string,
    entryId: string,
    entryUpdatedAt: string
  ) {
    super();
    this.id = id;
  }
}

export class EntriesSynchronizationCompletedMessage extends Message {
  type = "sync-recent-complete";

  constructor(id: string) {
    super();
    this.id = id;
  }
}

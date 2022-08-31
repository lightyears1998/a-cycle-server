import { IncomingMessage } from "http";
import {
  BadNodeIdError,
  BadParameterError,
  UserAuthenticationError,
} from "../error";
import { APP_NAME, getJwtTokenFromHttpAuthenticationHeader } from "../util";
import { HandshakeMessage } from "./message";
import { MessageStreamingWebsocket } from "./message-streaming";
import jwt from "jsonwebtoken";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { Container } from "typedi";
import { SERVER_UUID } from "../env";
import debug from "debug";

export class AuthenticatedSocketState {
  serverUuid!: string;
  userId!: string;
  nodeUuid!: string;
}

export type AuthenticatedWebSocket = MessageStreamingWebsocket & {
  logger: debug.Debugger;
  log: (formatter: unknown, ...args: unknown[]) => void;

  authState: AuthenticatedSocketState;
};

function log(
  this: AuthenticatedWebSocket,
  formatter: unknown,
  ...args: unknown[]
) {
  this.logger(formatter, ...args);
}

function doHandshake(
  socket: AuthenticatedWebSocket,
  request: IncomingMessage
): boolean {
  const authenticationHeader = String(request.headers.authorization);
  const token = getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

  if (!token) {
    socket.sendMessage(
      new HandshakeMessage([new BadParameterError("No token.")])
    );
    return false;
  }

  const jwtPayload = jwt.decode(token);
  if (!jwtPayload) {
    socket.sendMessage(
      new HandshakeMessage([new UserAuthenticationError("Fail to decode JWT.")])
    );
    return false;
  }

  if (typeof jwtPayload !== "object") {
    socket.sendMessage(
      new HandshakeMessage([
        new UserAuthenticationError("JWT payload should be object."),
      ])
    );
    return false;
  }

  const userId = jwtPayload.userId;
  if (!userId) {
    socket.sendMessage(
      new HandshakeMessage([new UserAuthenticationError("`userId` not found.")])
    );
    return false;
  }

  const nodeUuid = String(request.headers["a-cycle-client-uuid"]);
  if (!uuidValidate(nodeUuid) || !(uuidVersion(nodeUuid) === 4)) {
    socket.sendMessage(new HandshakeMessage([new BadNodeIdError()]));
    return false;
  }

  socket.authState.serverUuid = Container.get(SERVER_UUID);
  socket.authState.userId = userId;
  socket.authState.nodeUuid = nodeUuid;
  socket.logger = debug(`${APP_NAME}:${userId}:${nodeUuid}`);

  socket.sendMessage(
    new HandshakeMessage([], socket.authState.serverUuid, userId, nodeUuid)
  );

  socket.log("Handshake finished.");
  return true;
}

export function authenticatedWebSocketize(
  socket: MessageStreamingWebsocket,
  request: IncomingMessage
): AuthenticatedWebSocket | null {
  const patched = socket as AuthenticatedWebSocket;
  patched.authState = new AuthenticatedSocketState();
  patched.log = log.bind(patched);

  const ok = doHandshake(patched, request);
  return ok ? patched : null;
}

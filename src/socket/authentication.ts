import { IncomingMessage } from "http";
import {
  BadNodeIdError,
  BadParameterError,
  ServerError,
  UserAuthenticationError,
} from "../error";
import { APP_NAME, getJwtTokenFromHttpAuthenticationHeader } from "../utils";
import { HandshakeMessage } from "./message";
import { MessageStreamingWebsocket } from "./message-streaming";
import jwt, { JwtPayload } from "jsonwebtoken";
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

export function authenticateWebSocket(
  socket: MessageStreamingWebsocket,
  request: IncomingMessage
): AuthenticatedWebSocket | null {
  const patched = socket as AuthenticatedWebSocket;
  patched.authState = new AuthenticatedSocketState();
  patched.log = log.bind(patched);

  try {
    doHandshake(patched, request);
  } catch {
    return null;
  }

  return patched;
}

function doHandshake(
  socket: AuthenticatedWebSocket,
  request: IncomingMessage
): void {
  const token = extractToken(socket, request);
  const jwtPayload = verifyJwtPayload(socket, token);
  const userId = getUserId(socket, jwtPayload);
  const nodeUuid = getNodeUuid(socket, request);

  socket.authState.serverUuid = Container.get(SERVER_UUID);
  socket.authState.userId = userId;
  socket.authState.nodeUuid = nodeUuid;
  socket.logger = debug(`${APP_NAME}:${userId}:${nodeUuid}`);

  socket.sendMessage(
    new HandshakeMessage([], socket.authState.serverUuid, userId, nodeUuid)
  );

  socket.log("Handshake finished.");
}

function extractToken(
  socket: MessageStreamingWebsocket,
  request: IncomingMessage
): string {
  const authenticationHeader = String(request.headers.authorization);
  const token = getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

  if (!token) {
    socket.sendMessage(
      new HandshakeMessage([new BadParameterError("No token.")])
    );
    throw new ServerError();
  }

  return token;
}

function verifyJwtPayload(
  socket: MessageStreamingWebsocket,
  token: string
): jwt.JwtPayload {
  const jwtPayload = jwt.decode(token);
  if (!jwtPayload) {
    socket.sendMessage(
      new HandshakeMessage([new UserAuthenticationError("Fail to decode JWT.")])
    );
    throw new ServerError();
  }

  if (typeof jwtPayload !== "object") {
    socket.sendMessage(
      new HandshakeMessage([
        new UserAuthenticationError("JWT payload should be object."),
      ])
    );
    throw new ServerError();
  }

  return jwtPayload;
}

function getUserId(
  socket: MessageStreamingWebsocket,
  jwtPayload: JwtPayload
): string {
  const userId = jwtPayload.userId;

  if (!userId) {
    socket.sendMessage(
      new HandshakeMessage([new UserAuthenticationError("`userId` not found.")])
    );
    throw new ServerError();
  }

  return userId;
}

function getNodeUuid(
  socket: MessageStreamingWebsocket,
  request: IncomingMessage
) {
  const nodeUuid = String(request.headers["a-cycle-peer-node-uuid"]);
  if (!uuidValidate(nodeUuid) || !(uuidVersion(nodeUuid) === 4)) {
    socket.sendMessage(new HandshakeMessage([new BadNodeIdError()]));
    throw new ServerError();
  }

  return nodeUuid;
}

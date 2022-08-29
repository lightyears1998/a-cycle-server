import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import {
  APP_NAME,
  getJwtTokenFromHttpAuthenticationHeader,
  isDevelopmentEnvironment,
  logger,
} from "../util";
import {
  ClientServerHandshakeMessage,
  ControlMessage,
  Message,
} from "./message";
import { Container } from "typedi";
import { SERVER_ID } from "../env";
import {
  BadClientIdError,
  BadParameterError,
  UserAuthenticationError,
} from "../error";
import { getManager } from "../db";
import { Client } from "../entity/client";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import debug from "debug";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    const serverId = Container.get(SERVER_ID);
    let userId: string;
    let clientId: string;

    const send = (message: Message) => {
      const response = Object.assign({}, message);
      for (let i = 0; i < response.errors.length; ++i) {
        response.errors[i] = {
          name: response.errors[i].constructor.name,
          message: response.errors[i].message,
        };
      }

      socket.send(JSON.stringify(response));
    };

    const reply = (request: Message, response: Message) => {
      response.session = request.session;
      send(response);
    };

    const replyUnrecognizedMessage = (message: Message) => {
      reply(
        message,
        new ControlMessage([
          new BadParameterError("Unrecognized message type."),
        ])
      );
    };

    // Handshaking
    {
      // Authenticate user
      {
        const authenticationHeader = String(request.headers.authorization);
        const token =
          getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

        if (!token) {
          send(
            new ClientServerHandshakeMessage([
              new BadParameterError("No token."),
            ])
          );
          socket.close();
          return;
        }

        const jwtPayload = jwt.decode(token);
        if (!jwtPayload) {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("Fail to decode JWT."),
            ])
          );
          socket.close();
          return;
        }

        if (typeof jwtPayload !== "object") {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("JWT payload should be object."),
            ])
          );
          socket.close();
          return;
        }

        userId = jwtPayload.userId;
        if (!userId) {
          send(
            new ClientServerHandshakeMessage([
              new UserAuthenticationError("`userId` not found."),
            ])
          );
          socket.close();
          return;
        }
      }

      // Get client id
      {
        clientId = String(request.headers["a-cycle-client-uid"]);
        if (!uuidValidate(clientId) || !(uuidVersion(clientId) === 4)) {
          send(new ClientServerHandshakeMessage([new BadClientIdError()]));
          socket.close();
          return;
        }
      }

      // Finish handshaking
      send(new ClientServerHandshakeMessage([], serverId, userId, clientId));
    }

    const logger = debug(`${APP_NAME}:${userId}:${clientId}`);
    logger("Finished handshaking, proceed to sync.");

    const syncStatus = {
      server2client: {
        goodbye: false,
      },
      client2server: {
        "recent-sync-processing": false,
        "full-sync-processing": false,
        goodbye: false,
      },
    };

    // Request entries synchronization from client to server
    {
      const manager = getManager();
      const client = await manager.find(Client, { where: { uid: clientId } });
      if (client) {
        logger("Client record found, try to perform a recent-sync.");
        syncStatus.client2server["recent-sync-processing"] = true;
        // @TODO
      } else {
        logger(
          "Client record not found, record this client and then perform a full-sync."
        );
        syncStatus.client2server["full-sync-processing"] = true;
        // @TODO
      }
    }

    socket.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (err) {
        if (err instanceof SyntaxError) {
          send(new ControlMessage([new BadParameterError("Bad JSON syntax.")]));
          socket.close();
          return;
        } else {
          logger(err);
          throw err;
        }
      }

      if (typeof message.session !== "string" || message.session === "") {
        send(
          new ControlMessage([
            new BadParameterError(
              "Messsage should contain an non-empty session of string type."
            ),
          ])
        );
        socket.close();
        return;
      }

      // Handle message accroding to message type
      switch (message.type) {
        case "sync-recent-query": {
          break;
        }

        case "sync-recent-response": {
          break;
        }

        default: {
          if (isDevelopmentEnvironment()) {
            switch (message.type) {
              case "debug-client-update": {
                reply(message, new ControlMessage());
                break;
              }

              default: {
                replyUnrecognizedMessage(message);
              }
            }
          } else {
            replyUnrecognizedMessage(message);
          }
        }
      }

      // If both client and server say goodbye, do cleanup and disconnet
      if (
        syncStatus.client2server.goodbye &&
        syncStatus.server2client.goodbye
      ) {
        socket.close();
      }
    });
  });
}

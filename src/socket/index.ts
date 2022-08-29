import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { getJwtTokenFromHttpAuthenticationHeader, logger } from "../util";
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

    // Request entries synchronization from client to server
    {
      const manager = getManager();
      const client = await manager.find(Client, { where: { uid: clientId } });
      if (client) {
        // If client record is found, try to perform recent sync
      } else {
        // If client record is not found, record this client and perform full sync.
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

      switch (message.type) {
        default: {
          send(
            new ControlMessage([
              new BadParameterError("Unrecognized message type."),
            ])
          );
          socket.close();
          return;
        }

        case "sync-recent-query": {
          break;
        }

        case "sync-recent-response": {
          break;
        }

        case "bad-apple": {
          send(
            new ControlMessage([], {
              greetings: "Are you a fan of 東方Project?",
            })
          );
          break;
        }
      }
    });
  });
}

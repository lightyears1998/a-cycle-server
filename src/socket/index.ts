import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { getJwtTokenFromHttpAuthenticationHeader, logger } from "../util";
import { ClientServerHandshakeMessage, ControlMessage } from "./message";
import { Container } from "typedi";
import { SERVER_ID } from "../env";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    const send = (message: unknown) => {
      socket.send(JSON.stringify(message));
    };

    const serverId = Container.get(SERVER_ID);
    let userId: string;
    {
      // Authentication phase
      const authenticationHeader = String(request.headers.authorization);
      const token =
        getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

      if (!token) {
        send(new ClientServerHandshakeMessage(["No token"]));
        socket.close();
        return;
      }

      const jwtPayload = jwt.decode(token);
      if (!jwtPayload) {
        send(new ClientServerHandshakeMessage(["Fail to decode JWT"]));
        socket.close();
        return;
      }

      if (typeof jwtPayload !== "object") {
        send(
          new ClientServerHandshakeMessage(["JWT payload should be object"])
        );
        socket.close();
        return;
      }

      userId = jwtPayload.userId;
      if (!userId) {
        send(new ClientServerHandshakeMessage(["`userId` not found"]));
        socket.close();
        return;
      }

      send(new ClientServerHandshakeMessage([], serverId, userId));
    }

    {
      // Initialize entries synchronization from sever to client
    }

    socket.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (err) {
        if (err instanceof SyntaxError) {
          send(new ControlMessage(["Bad JSON syntax"]));
          socket.close();
          return;
        } else {
          logger(err);
          throw err;
        }
      }

      if (typeof message.id !== "string" || message.id === "") {
        send(
          new ControlMessage([
            "Messsage should contain an non-empty id of string type",
          ])
        );
        socket.close();
        return;
      }

      switch (message.type) {
        default: {
          send(new ControlMessage(["Bad message type"]));
          socket.close();
          return;
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

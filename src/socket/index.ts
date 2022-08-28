import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { getJwtTokenFromHttpAuthenticationHeader } from "../util";
import { AuthMessage, WelcomeMessage } from "./message";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    const send = (message: unknown) => {
      socket.send(JSON.stringify(message));
    };

    let userId: string;
    {
      // Authentication phase
      const authenticationHeader = String(request.headers.authorization);
      const token =
        getJwtTokenFromHttpAuthenticationHeader(authenticationHeader);

      if (!token) {
        send(new AuthMessage(false, "No token"));
        socket.close();
        return;
      }

      const jwtPayload = jwt.decode(token);
      if (!jwtPayload) {
        send(new AuthMessage(false, "Fail to decode JWT"));
        socket.close();
        return;
      }

      if (typeof jwtPayload !== "object") {
        send(new AuthMessage(false, "JWT payload should be object"));
        socket.close();
        return;
      }

      userId = jwtPayload.userId;
      if (!userId) {
        send(new AuthMessage(false, "`userId` not found"));
        socket.close();
        return;
      }

      send(new WelcomeMessage(userId));
    }

    socket.on("message", (data) => {
      console.log(data);
    });
  });
}

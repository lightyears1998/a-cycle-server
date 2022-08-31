import { WebSocketServer } from "ws";
import { messageStreammingWebSocketize } from "./message-streaming";
import { authenticatedWebSocketize } from "./authentication";
import { syncEntriesViaSocket } from "./sync";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    // Enable message streaming
    const messageSocket = messageStreammingWebSocketize(socket);

    // Authenticate user and node
    const authenticatedSocket = authenticatedWebSocketize(
      messageSocket,
      request
    );
    if (!authenticatedSocket) {
      messageSocket.close();
      return;
    }

    // Sync entries
    syncEntriesViaSocket(authenticatedSocket);
  });
}

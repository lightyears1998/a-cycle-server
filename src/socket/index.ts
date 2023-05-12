import { WebSocketServer } from "ws";
import { buildMessageStreammingWebSocket } from "./message-streaming";
import { authenticateWebSocket } from "./authentication";
import { syncEntriesViaSocket } from "./sync";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    // Enable message streaming
    const messageSocket = buildMessageStreammingWebSocket(socket);

    // Authenticate user and node
    const authenticatedSocket = authenticateWebSocket(messageSocket, request);
    if (!authenticatedSocket) {
      messageSocket.close();
      return;
    }

    // Sync entries
    syncEntriesViaSocket(authenticatedSocket);
  });
}

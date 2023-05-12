import { WebSocketServer } from "ws";
import { buildMessageStreammingWebSocket } from "./message-streaming";
import { authenticateWebSocket } from "./authentication";
import { buildSyncingWebSocket, syncEntries } from "./sync";

export function setupWebsocketServer(server: WebSocketServer) {
  server.on("connection", async (socket, request) => {
    // Enable message streaming
    const messageSocket = buildMessageStreammingWebSocket(socket);

    // Authenticate user
    const authenticatedSocket = authenticateWebSocket(messageSocket, request);
    if (!authenticatedSocket) {
      messageSocket.close();
      return;
    }

    // Sync entries
    try {
      const syncingSocket = buildSyncingWebSocket(authenticatedSocket);
      await syncEntries(syncingSocket);
    } finally {
      socket.close();
    }
  });
}

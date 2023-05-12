import { ControlMessage, Message } from "./message";
import { BadParameterError } from "../error";
import { RawData } from "ws";
import { MalformedMessageError } from "./sync-error";
import { SyncingWebSocket } from "./sync";

function tryParseMessageJSON(socket: SyncingWebSocket, data: RawData): Message {
  let message;

  try {
    message = JSON.parse(data.toString());
  } catch (err) {
    if (err instanceof SyntaxError) {
      socket.sendMessage(
        new ControlMessage([new BadParameterError("Bad JSON syntax.")])
      );
      socket.close();
    }

    socket.log(err);
    throw err;
  }

  return message;
}
function checkMessageIntegrity(
  socket: SyncingWebSocket,
  message: Message
): void {
  if (typeof message.session !== "string" || message.session === "") {
    socket.sendMessage(
      new ControlMessage([
        new BadParameterError(
          "Messsage should contain an non-empty session of string type."
        ),
      ])
    );
    socket.close();
    throw new MalformedMessageError();
  }

  if (!message.type) {
    socket.replyMessage(
      message,
      new ControlMessage([
        new BadParameterError(
          "Each message must contain a valid `type` field."
        ),
      ])
    );
    throw new MalformedMessageError();
  }
}

export function parseMessage(
  socket: SyncingWebSocket,
  data: RawData
): Message | null {
  const message = tryParseMessageJSON(socket, data);
  checkMessageIntegrity(socket, message);

  return message;
}

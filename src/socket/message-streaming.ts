import { Message, ControlMessage, SessionId } from "./message";
import { WebSocket } from "ws";
import { BadParameterError } from "../error";

export type MessageStreamingWebsocket = WebSocket & {
  sendMessage: (message: Message) => SessionId;
  replyMessage: (request: Message, response: Message) => SessionId;
  replyUnrecognizedMessage: (message: Message) => void;
};

function sendMessage(this: WebSocket, message: Message) {
  const outgoingMessage = Object.assign({}, message);
  for (let i = 0; i < message.errors.length; ++i) {
    outgoingMessage.errors[i] = {
      name: message.errors[i].constructor.name,
      message: message.errors[i].message,
    };
  }

  this.send(JSON.stringify(outgoingMessage));
  return outgoingMessage.session;
}

function replyMessage(
  this: MessageStreamingWebsocket,
  request: Message,
  response: Message
) {
  response.session = request.session;
  return this.sendMessage(response);
}

function replyUnrecognizedMessage(
  this: MessageStreamingWebsocket,
  message: Message
) {
  this.replyMessage(
    message,
    new ControlMessage([new BadParameterError("Unrecognized message type.")])
  );
}

export const messageStreammingWebSocketize = (
  socket: WebSocket
): MessageStreamingWebsocket => {
  const patched = socket as MessageStreamingWebsocket;
  patched.sendMessage = sendMessage.bind(patched);
  patched.replyMessage = replyMessage.bind(patched);
  patched.replyUnrecognizedMessage = replyUnrecognizedMessage.bind(patched);
  return patched;
};

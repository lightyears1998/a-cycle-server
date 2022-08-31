import { Message, ControlMessage } from "./message";
import { WebSocket } from "ws";
import { BadParameterError } from "../error";

export type MessageStreamingWebsocket = WebSocket & {
  sendMessage: (message: Message) => void;
  replyMessage: (request: Message, response: Message) => void;
  replyUnrecognizedMessage: (message: Message) => void;
};

function sendMessage(this: WebSocket, message: Message) {
  const response = Object.assign({}, message);
  for (let i = 0; i < response.errors.length; ++i) {
    response.errors[i] = {
      name: response.errors[i].constructor.name,
      message: response.errors[i].message,
    };
  }

  this.send(JSON.stringify(response));
}

function replyMessage(
  this: MessageStreamingWebsocket,
  request: Message,
  response: Message
) {
  response.session = request.session;
  this.sendMessage(response);
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

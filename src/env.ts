import { Container, Token } from "typedi";
import Randomstring from "randomstring";
import dotenv from "dotenv";
import { isTrue } from "./util";

dotenv.config();

/**
 * UUID to identify the server instance.
 */
export const SERVER_ID = new Token<string>("SERVER_ID");

export const SERVER_PORT = new Token<number>("SERVER_PORT");
Container.set(SERVER_PORT, Number(process.env.SERVER_PORT) || 5280);

export const SERVER_HOST = new Token<string>("SERVER_HOST");
Container.set(SERVER_HOST, process.env.SERVER_HOST || "localhost");

export const USER_REGISTRATION_ENABLED = new Token<boolean>(
  "USER_REGISTRATION_ENABLED"
);
Container.set(
  USER_REGISTRATION_ENABLED,
  isTrue(process.env.SERVER_ENABLE_USER_REGISTRATION)
);

/**
 * In some routing, admin token are used to bypass some checks,
 * can be useful for development.
 * Set it to `""` to disable bypass.
 */
export const ADMIN_TOKEN = new Token<string>("ADMIN_TOKEN");
Container.set(ADMIN_TOKEN, process.env.SERVER_ADMIN_TOKEN || "");

export const JWT_SECRET_TOKEN = new Token<string>("JWT_SECRET");
Container.set(
  JWT_SECRET_TOKEN,
  process.env.SERVER_JWT_SECRET ||
    Randomstring.generate({ length: 32, charset: "hex" })
);

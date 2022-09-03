import { Container, Token } from "typedi";
import Randomstring from "randomstring";
import dotenv from "dotenv";
import { isDevelopmentEnvironment, isTrue } from "./util";

dotenv.config();

/**
 * UUID to identify the server instance.
 */
export const SERVER_UUID = new Token<string>("SERVER_UUID");

export const SERVER_ENDPOINT_PREFIX = new Token<string>(
  "SERVER_ENDPOINT_PREFIX"
);
Container.set(SERVER_ENDPOINT_PREFIX, "/api");

export const SERVER_HTTP_PORT = new Token<number>("SERVER_HTTP_PORT");
Container.set(SERVER_HTTP_PORT, Number(process.env.SERVER_HTTP_PORT) || 5280);

export const SERVER_WS_PORT = new Token<number>("SERVER_WS_PORT");
Container.set(SERVER_WS_PORT, Number(process.env.SERVER_WS_PORT || 5281));

export const SERVER_HOST = new Token<string>("SERVER_HOST");
Container.set(SERVER_HOST, process.env.SERVER_HOST || "localhost");

export const USER_REGISTRATION_ENABLED = new Token<boolean>(
  "USER_REGISTRATION_ENABLED"
);

export const PG_HOST = new Token<string>("PG_HOST");
export const PG_PORT = new Token<number>("PG_PORT");
export const PG_DATABASE = new Token<string>("PG_DATABASE");
export const PG_USERNAME = new Token<string>("PG_USERNAME");
export const PG_PASSWORD = new Token<string>("PG_PASSWORD");
Container.set(PG_HOST, process.env.PG_HOST || "localhost");
Container.set(PG_PORT, Number(process.env.PG_PORT) || 5432);
Container.set(PG_DATABASE, process.env.PG_DATABASE || "acycle");
Container.set(PG_USERNAME, process.env.PG_USERNAME || "acycle");
Container.set(PG_PASSWORD, process.env.PG_PASSWORD || "pa$$w0rd");

export const DEV_DATABASE_LOGGING = new Token<boolean>("DEV_DATABASE_LOGGING");
export const DEV_DATABASE_SYNC = new Token<boolean>("DEV_DATABASE_SYNC");
Container.set(DEV_DATABASE_LOGGING, isTrue(process.env.DEV_DATABASE_LOGGING));
Container.set(
  DEV_DATABASE_SYNC,
  isTrue(
    typeof process.env.DEV_DATABASE_SYNC !== "undefined"
      ? process.env.DEV_DATABASE_SYNC
      : isDevelopmentEnvironment()
  )
);

/**
 * In some routing, admin token are used to bypass some checks,
 * can be useful for development.
 * Set it to `""` to disable bypass.
 */
export const ADMIN_TOKEN = new Token<string>("ADMIN_TOKEN");
Container.set(ADMIN_TOKEN, process.env.SERVER_DEFAULT_ADMIN_TOKEN || "");

export const JWT_SECRET_TOKEN = new Token<string>("JWT_SECRET");
Container.set(
  JWT_SECRET_TOKEN,
  process.env.SERVER_JWT_SECRET ||
    Randomstring.generate({ length: 32, charset: "hex" })
);

export const TRANSMISSION_PAGING_SIZE = 50;

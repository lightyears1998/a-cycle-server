import { randomUUID } from "crypto";
import type { JsonValue } from "type-fest";
import { Container, Token } from "typedi";
import { ADMIN_TOKEN, SERVER_UUID, USER_REGISTRATION_ENABLED } from "./env";

export type MetadataTuple<T extends JsonValue> = [
  token: Token<T>,
  key: string,
  defaultValue: T | null
];

export const metadataTuples: Array<MetadataTuple<string | number | boolean>> = [
  [SERVER_UUID, "SERVER_UUID", randomUUID()],
  [USER_REGISTRATION_ENABLED, "USER_REGISTRATION_ENABLED", false],
  [ADMIN_TOKEN, "ADMIN_TOKEN", Container.get(ADMIN_TOKEN) || ""],
];

import { DataSource, EntityManager } from "typeorm";
import {
  ADMIN_TOKEN,
  DEV_DATABASE_LOGGING,
  DEV_DATABASE_SYNC,
  PG_DATABASE,
  PG_HOST,
  PG_PASSWORD,
  PG_PORT,
  PG_USERNAME,
  SERVER_UUID,
  USER_REGISTRATION_ENABLED,
} from "./env";
import { Container, Token } from "typedi";
import { ServerStorage } from "./entity/server-storage";
import { randomUUID } from "crypto";
import type { JsonValue } from "type-fest";

export const dataSource = new DataSource({
  type: "postgres",
  host: Container.get(PG_HOST),
  port: Container.get(PG_PORT),
  database: Container.get(PG_DATABASE),
  username: Container.get(PG_USERNAME),
  password: Container.get(PG_PASSWORD),
  logging: Container.get(DEV_DATABASE_LOGGING),
  synchronize: Container.get(DEV_DATABASE_SYNC),
  entities: [`${__dirname}/entity/**/*.{ts,js}`],
});

export function getManager() {
  return dataSource.manager;
}

export async function setupEntityManager() {
  Container.set(EntityManager, getManager());
}

export async function loadMetadataFromServerStorage() {
  const manager = getManager();

  type Tuple<T extends JsonValue> = [
    token: Token<T>,
    key: string,
    defaultValue?: T
  ];

  const load = async <T extends JsonValue>([
    token,
    key,
    defaultValue,
  ]: Tuple<T>) => {
    let storage = await manager.findOne(ServerStorage, {
      where: { key: key },
    });
    if (!storage && typeof defaultValue !== "undefined") {
      storage = manager.create(ServerStorage, {
        key: key,
        value: defaultValue,
      });
      storage = await manager.save(storage);
    }

    if (storage) {
      Container.set(token, storage.value);
    }
  };

  const metadata: Array<Tuple<string | number | boolean>> = [
    [SERVER_UUID, "SERVER_UUID", randomUUID()],
    [USER_REGISTRATION_ENABLED, "USER_REGISTRATION_ENABLED", false],
    [ADMIN_TOKEN, "ADMIN_TOKEN", Container.get(ADMIN_TOKEN) || ""],
  ];
  await Promise.allSettled(
    metadata.map(
      (tuple) =>
        new Promise<void>(async (resolve) => {
          await load(tuple);
          resolve();
        })
    )
  );
}

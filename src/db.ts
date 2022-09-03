import { DataSource, EntityManager } from "typeorm";
import {
  DEV_DATABASE_LOGGING,
  DEV_DATABASE_SYNC,
  PG_DATABASE,
  PG_HOST,
  PG_PASSWORD,
  PG_PORT,
  PG_USERNAME,
} from "./env";
import { Container } from "typedi";
import { ServerStorage } from "./entity/server-storage";
import type { JsonValue } from "type-fest";
import { MetadataTuple, metadataTuples } from "./metadata";

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

  const load = async <T extends JsonValue>([
    token,
    key,
    defaultValue,
  ]: MetadataTuple<T>) => {
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

  await Promise.allSettled(
    metadataTuples.map(
      (tuple) =>
        new Promise<void>(async (resolve) => {
          await load(tuple);
          resolve();
        })
    )
  );
}

import { DataSource, EntityManager } from "typeorm";
import { isTrue } from "./util";
import { SERVER_UUID } from "./env";
import { Container } from "typedi";
import { ServerStorage } from "./entity/server-storage";
import { randomUUID } from "crypto";

export const dataSource = new DataSource({
  type: "postgres",
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || "acycle",
  username: process.env.PG_USERNAME || "acycle",
  password: process.env.PG_PASSWORD,
  logging: isTrue(process.env.DEV_DATABASE_LOGGING),
  synchronize: isTrue(process.env.DEV_DATABASE_SYNC),
  entities: [`${__dirname}/entity/**/*.{ts,js}`],
});

export function getManager() {
  return dataSource.manager;
}

export async function setupEntityManager() {
  Container.set(EntityManager, getManager());
}

export async function setupMetadataFromDatabase() {
  const manager = getManager();

  let serverIdStorage = await manager.findOne(ServerStorage, {
    where: { key: "SERVER_ID" },
  });
  if (!serverIdStorage) {
    serverIdStorage = manager.create(ServerStorage, {
      key: "SERVER_ID",
      value: randomUUID(),
    });
    serverIdStorage = await manager.save(serverIdStorage);
  }

  Container.set(SERVER_UUID, serverIdStorage.value);
}

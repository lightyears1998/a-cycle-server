import { DataSource, EntityManager } from "typeorm";
import { isTrue } from "./util";
import { SERVER_ID } from "./env";
import { Container } from "typedi";
import { Metadata } from "./entity/metadata";
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

  let serverIdMetadata = await manager.findOne(Metadata, {
    where: { key: "SERVER_ID" },
  });
  if (!serverIdMetadata) {
    serverIdMetadata = manager.create(Metadata, {
      key: "SERVER_ID",
      value: randomUUID(),
    });
    serverIdMetadata = await manager.save(serverIdMetadata);
  }

  Container.set(SERVER_ID, serverIdMetadata.value);
}

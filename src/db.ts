import { DataSource } from "typeorm";
import { isTrue } from "./util";
import dotenv from "dotenv";

dotenv.config();

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

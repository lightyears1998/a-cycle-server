import "reflect-metadata";
import koa from "koa";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { isTrue } from "./util";
import Router from "koa-router";
import responseTimeMiddleware from "koa-response-time";
import compressMiddleware from "koa-compress";
import corsMiddleware from "@koa/cors";
import staticMiddleware from "koa-static";
import fs from "fs-extra";
import { setupRoutes } from "./route";

dotenv.config();

async function setupDatabase() {
  await new DataSource({
    type: "postgres",
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE || "acycle",
    username: process.env.PG_USERNAME || "acycle",
    password: process.env.PG_PASSWORD,
    logging: isTrue(process.env.DEV_DATABASE_LOGGING),
    synchronize: isTrue(process.env.DEV_DATABASE_SYNC),
    entities: [`${__dirname}/entity/**/*.{ts,js}`],
  }).initialize();
}

async function setupRouter(): Promise<Router> {
  const router = new Router();
  setupRoutes(router);
  return router;
}

async function setupServer() {
  const port = Number(process.env.SERVER_PORT) || 5280;
  const host = process.env.SERVER_HOST || "localhost";

  const server = new koa();
  server.use(responseTimeMiddleware({ hrtime: true }));
  server.use(corsMiddleware({ credentials: true }));
  server.use(compressMiddleware());

  const router = await setupRouter();
  server.use(router.routes());
  server.use(router.allowedMethods());

  return new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.log(`Server listening at ${host}:${port}`);
      resolve();
    });
  });
}

async function bootstrap() {
  await setupDatabase();
  await setupServer();
}

bootstrap();

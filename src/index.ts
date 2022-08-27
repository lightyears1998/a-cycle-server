import "reflect-metadata";
import koa from "koa";
import { logger } from "./util";
import responseTimeMiddleware from "koa-response-time";
import compressMiddleware from "koa-compress";
import corsMiddleware from "@koa/cors";
import { setupRouter } from "./route";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import Container from "typedi";
import { SERVER_HOST, SERVER_PORT } from "./env";

async function setupEnvironmentVariables() {
  await import("./env");
  logger("Environment variables setup.");
}

async function setupDatabase() {
  await (await import("./db")).dataSource.initialize();
  logger("Database setup.");
}

async function setupServer() {
  const port = Container.get(SERVER_PORT);
  const host = Container.get(SERVER_HOST);

  const server = new koa();
  server.use(responseTimeMiddleware({ hrtime: true }));
  server.use(corsMiddleware({ credentials: true }));
  server.use(bodyParser());
  server.use(compressMiddleware());

  const router = new Router();
  setupRouter(router);
  server.use(router.routes());
  server.use(router.allowedMethods());

  return new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      logger(`Server listening at ${host}:${port}`);
      resolve();
    });
  });
}

async function bootstrap() {
  await setupEnvironmentVariables();
  await Promise.allSettled([setupDatabase(), setupServer()]);
}

bootstrap();

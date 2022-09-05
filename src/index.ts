import "reflect-metadata";
import koa from "koa";
import { checkGcInDevelopment, logger } from "./util";
import responseTimeMiddleware from "koa-response-time";
import compressMiddleware from "koa-compress";
import corsMiddleware from "@koa/cors";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import { Container } from "typedi";
import {
  SERVER_HOST,
  SERVER_UUID,
  SERVER_HTTP_PORT,
  SERVER_WS_PORT,
  SERVER_ENDPOINT_PREFIX,
} from "./env";
import { WebSocketServer } from "ws";

async function setupEnvironmentVariables() {
  await import("./env");
  logger("Environment variables setup.");
}

async function setupDatabase() {
  const databaseModule = await import("./db");
  await databaseModule.dataSource.initialize();
  await databaseModule.setupEntityManager();
  await databaseModule.loadMetadataFromServerStorage();
  logger("Database setup.");
}

async function setupRestfulEndpoint() {
  const port = Container.get(SERVER_HTTP_PORT);
  const host = Container.get(SERVER_HOST);

  const httpServer = new koa();
  httpServer.use(responseTimeMiddleware({ hrtime: true }));
  httpServer.use(corsMiddleware({ credentials: true }));
  httpServer.use(bodyParser());
  httpServer.use(compressMiddleware());

  const router = new Router();
  (await import("./route")).setupRouter(router);
  httpServer.use(router.routes());
  httpServer.use(router.allowedMethods());

  return new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      resolve();
      logger(`RESTful HTTP server is listening at http://${host}:${port}.`);
    });
  });
}

async function setupWebsocketEndpoint() {
  const path = `${Container.get(SERVER_ENDPOINT_PREFIX)}/socket`;
  const port = Container.get(SERVER_WS_PORT);
  const host = Container.get(SERVER_HOST);

  return new Promise<void>(async (resolve) => {
    const websocketServer = new WebSocketServer(
      {
        host,
        port,
        path,
      },
      async () => {
        (await import("./socket")).setupWebsocketServer(websocketServer);
        resolve();
        logger(`Websocket server is listening at http://${host}:${port}.`);
      }
    );
  });
}

async function bootstrap() {
  await setupEnvironmentVariables();
  await setupDatabase();
  await Promise.all([setupRestfulEndpoint(), setupWebsocketEndpoint()]);
  console.log(`Server instance ${Container.get(SERVER_UUID)} is operating.`);

  checkGcInDevelopment(
    bootstrap,
    setupDatabase,
    setupEnvironmentVariables,
    setupRestfulEndpoint,
    setupWebsocketEndpoint
  );
}

bootstrap();

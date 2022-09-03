import Router from "koa-router";
import { Container } from "typedi";
import { SERVER_ENDPOINT_PREFIX } from "../env";
import appInfoRouter from "./app-info";
import { contentNormalizationMiddleware } from "./middleware/content-normalization";
import { errorHandlingMiddleware } from "./middleware/error-handling";
import { timestampCheckMiddleware } from "./middleware/timestamp-check";
import usersRouter from "./users";
import adminRouter from "./admin";

class Route {
  path: string;
  router: Router;

  constructor(path: string, router: Router) {
    this.path = path;
    this.router = router;
  }
}

export function setupRouter(router: Router) {
  router.prefix(Container.get(SERVER_ENDPOINT_PREFIX));

  router.use(contentNormalizationMiddleware);
  router.use(errorHandlingMiddleware);
  router.use(timestampCheckMiddleware);

  const routes = [
    new Route("/", appInfoRouter),
    new Route("/server/info", appInfoRouter),
    new Route("/users", usersRouter),
    new Route("/admin", adminRouter),
  ];

  for (const route of routes) {
    router.use(
      route.path,
      route.router.routes(),
      route.router.allowedMethods()
    );
  }
}

import Router from "koa-router";
import appInfoRouter from "./app-info";
import { contentNormalizationMiddleware } from "./middleware/content-normalization";
import { errorHandlingMiddleware } from "./middleware/error-handling";
import { timestampCheckMiddleware } from "./middleware/timestamp-check";
import usersRouter from "./users";

class Route {
  path: string;
  router: Router;

  constructor(path: string, router: Router) {
    this.path = path;
    this.router = router;
  }
}

export function setupRouter(router: Router) {
  router.use(contentNormalizationMiddleware);
  router.use(errorHandlingMiddleware);
  router.use(timestampCheckMiddleware);

  const routes = [
    new Route("/", appInfoRouter),
    new Route("/server/info", appInfoRouter),
    new Route("/users", usersRouter),
  ];

  for (const route of routes) {
    router.use(
      route.path,
      route.router.routes(),
      route.router.allowedMethods()
    );
  }
}

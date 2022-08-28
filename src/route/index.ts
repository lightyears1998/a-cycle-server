import Router, { IMiddleware } from "koa-router";
import { ServerError } from "../error";
import { logger } from "../util";
import appInfoRouter from "./app-info";
import usersRouter from "./users";

export const PAGE_SIZE = 50;

class Route {
  path: string;
  router: Router;

  constructor(path: string, router: Router) {
    this.path = path;
    this.router = router;
  }
}

export function setupRouter(router: Router) {
  const errorMiddleware: IMiddleware = async (ctx, next) => {
    try {
      const ret = await next();
      return ret;
    } catch (err) {
      if (err instanceof ServerError) {
        if (!ctx.body) {
          ctx.body = {
            errors: [
              {
                name: err.constructor.name,
                message: err.message,
              },
            ],
            payload: null,
          };
        }
      } else {
        logger(err);
      }
    }
  };

  router.use(errorMiddleware);

  const contentMiddleware: IMiddleware = async (ctx, next) => {
    await next();

    if (ctx.body) {
      if (typeof ctx.body === "object") {
        if ("errors" in ctx.body || "payload" in ctx.body) {
          ctx.body.errors = ctx.body.errors || [];
          for (let i = 0; i < ctx.body.errors.length; ++i) {
            if (ctx.body.errors[i] instanceof ServerError) {
              ctx.body.errors[i] = ctx.body.errors[i].constructor.name;
            }
          }
          ctx.body.payload = ctx.body.payload || {};
        } else {
          ctx.body = {
            errors: [],
            payload: ctx.body,
          };
        }
      }
    }
  };

  router.use(contentMiddleware);

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

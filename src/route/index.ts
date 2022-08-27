import Router, { IMiddleware } from "koa-router";
import { BaseServerError } from "./error";
import infoRouter from "./info";
import userRouter from "./user";

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
      if (err instanceof BaseServerError) {
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
        throw err;
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
    new Route("/", infoRouter),
    new Route("/server/info", infoRouter),
    new Route("/users", userRouter),
  ];

  for (const route of routes) {
    router.use(
      route.path,
      route.router.routes(),
      route.router.allowedMethods()
    );
  }
}

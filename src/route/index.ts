import Router, { IMiddleware } from "koa-router";
import moment from "moment";
import { ClockOutOfSyncError, ServerError } from "../error";
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
  /** Middleware used for normalizing RESTful response */
  const contentMiddleware: IMiddleware = async (ctx, next) => {
    const ret = await next();

    if (ctx.body) {
      if (typeof ctx.body === "object") {
        if ("errors" in ctx.body || "payload" in ctx.body) {
          // Normalize errors
          ctx.body.errors = ctx.body.errors || [];
          for (let i = 0; i < ctx.body.errors.length; ++i) {
            if (ctx.body.errors[i] instanceof ServerError) {
              ctx.body.errors[i] = {
                name: ctx.body.errors[i].constructor.name,
                message: ctx.body.errors[i].message,
              };
            }
          }

          // Normalize payload
          ctx.body.payload = ctx.body.payload || {};

          // Add timestamp
          ctx.body.timestamp = new Date().toISOString();
        } else {
          ctx.body = {
            errors: [],
            payload: ctx.body,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    return ret;
  };

  router.use(contentMiddleware);

  /** Middleware to handle error during routing */
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

  /** Middleware to check server/client clock synchronization */
  const timeSynchronizationMiddleware: IMiddleware = async (ctx, next) => {
    const dateHeader = ctx.header.date;
    if (dateHeader) {
      if (
        Math.abs(moment(new Date(dateHeader)).diff(new Date(), "minutes")) >= 5
      ) {
        throw new ClockOutOfSyncError();
      }
    }

    return next();
  };

  router.use(timeSynchronizationMiddleware);

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

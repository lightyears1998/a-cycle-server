import { IMiddleware } from "koa-router";
import { ServerError } from "../../error";

/** Middleware used for normalizing RESTful response */
export const contentNormalizationMiddleware: IMiddleware = async (
  ctx,
  next
) => {
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

        // Attach timestamp
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

import { IMiddleware } from "koa-router";
import { ServerError } from "../../error";

/** Middleware used for normalizing RESTful response */
export const contentNormalizationMiddleware: IMiddleware = async (
  ctx,
  next
) => {
  const ret = await next();

  if (ctx.body && typeof ctx.body === "object") {
    if ("errors" in ctx.body || "payload" in ctx.body) {
      // Normalize errors
      ctx.body.errors = normalizeErrors(ctx.body.errors);

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

  return ret;
};

function normalizeErrors(errors: Error[]): ServerError[] {
  errors = errors || [];

  for (let i = 0; i < errors.length; ++i) {
    if (errors[i] instanceof ServerError) {
      errors[i] = {
        name: errors[i].constructor.name,
        message: errors[i].message,
      };
    }
  }

  return errors;
}

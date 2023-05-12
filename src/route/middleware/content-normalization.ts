import { IMiddleware } from "koa-router";
import { ServerError } from "../../error";

interface FormalResponseBody {
  errors: ServerError[];
  payload: Record<string, unknown> | null;
  timestamp: string;
}

/** Middleware used for normalizing RESTful response */
export const contentNormalizationMiddleware: IMiddleware = async (
  ctx,
  next
) => {
  const ret = await next();

  if (ctx.body && typeof ctx.body === "object") {
    if ("errors" in ctx.body || "payload" in ctx.body) {
      ctx.body = normalizeObjectKindResponseBody(ctx.body);
    } else {
      ctx.body = wrapResponseBody(ctx.body);
    }
  }

  return ret;
};

function normalizeObjectKindResponseBody(
  body: FormalResponseBody
): FormalResponseBody {
  return {
    errors: normalizeErrors(body.errors),
    payload: body.payload || {},
    timestamp: new Date().toISOString(),
  };
}

function wrapResponseBody(body: Record<string, unknown>): FormalResponseBody {
  return {
    errors: [],
    payload: body,
    timestamp: new Date().toISOString(),
  };
}

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

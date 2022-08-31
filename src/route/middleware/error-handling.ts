import { IMiddleware } from "koa-router";
import path from "path";
import { APP_ROOT, logger } from "../../util";
import { InternalServerError, ServerError } from "../../error";

/** Middleware to handle error during routing */
export const errorHandlingMiddleware: IMiddleware = async (ctx, next) => {
  try {
    const ret = await next();
    return ret;
  } catch (err) {
    if (err instanceof Error && !(err instanceof ServerError)) {
      logger(err);

      err = new InternalServerError(
        JSON.stringify({
          name: err.name,
          message:
            err.message &&
            err.message.replaceAll(APP_ROOT, `${path.sep}root${path.sep}`),
          cause: err.cause,
          stack:
            err.stack &&
            err.stack.replaceAll(APP_ROOT, `${path.sep}root${path.sep}`),
        })
      );
    }

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
    }
  }
};

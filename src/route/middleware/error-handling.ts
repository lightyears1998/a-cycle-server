import { IMiddleware } from "koa-router";
import path from "path";
import { APP_ROOT_DIR, logger } from "../../util";
import { InternalServerError, ServerError } from "../../error";

/**
 * Replace all occurrences of `APP_ROOT_DIR` from message with "/root/" to hide real app path.
 *
 * @param message
 * @returns
 */
function maskAppRoot(message: string): string {
  return message.replaceAll(APP_ROOT_DIR, `${path.sep}root${path.sep}`);
}

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
          message: err.message && maskAppRoot(err.message),
          cause: err.cause,
          stack: err.stack && maskAppRoot(err.stack),
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

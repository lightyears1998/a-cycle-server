import { IMiddleware } from "koa-router";
import moment from "moment";
import { ClockOutOfSyncError } from "../../error";

/**
 * Middleware to check server/client clock consistency
 */
export const timestampCheckMiddleware: IMiddleware = async (ctx, next) => {
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

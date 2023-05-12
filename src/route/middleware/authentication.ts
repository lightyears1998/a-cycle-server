import { Context, Middleware } from "koa";
import { Container } from "typedi";
import { JWT_SECRET_TOKEN } from "../../env";
import { UserAuthenticationError } from "../../error";
import jwt from "jsonwebtoken";
import { getJwtTokenFromHttpAuthenticationHeader } from "../../utils";
import type { JsonObject } from "type-fest";
import { isObject } from "class-validator";

export enum AuthenticationPolicy {
  NONE,
  LOGIN,
  SAME_USER_ID_WITH_PATH_PARAM,
}

function getJwtPayload(
  policy: AuthenticationPolicy,
  authorizationHeader: string
): JsonObject | null {
  if (policy === AuthenticationPolicy.NONE) {
    return null;
  }

  const token = getJwtTokenFromHttpAuthenticationHeader(authorizationHeader);
  if (token) {
    let jwtPayload = {};
    jwtPayload = jwt.verify(token, Container.get(JWT_SECRET_TOKEN));
    if (!isObject(jwtPayload)) {
      throw new UserAuthenticationError(
        "Bad jwt-token. Payload should be object type."
      );
    }
    return jwtPayload as JsonObject;
  }

  return null;
}

function sameUserIdWithPathParamCheck(
  ctx: Context,
  jwtPayload: JsonObject | null
): boolean {
  if (!jwtPayload) {
    return false;
  }

  const { userId } = ctx.params;
  if (!userId) {
    throw new Error("No `userId` is set in path params.");
  }

  if (!jwtPayload.userId) {
    throw new UserAuthenticationError("No `userId` is set in JWT payload.");
  }

  if (userId !== jwtPayload.userId) {
    throw new UserAuthenticationError("`userId` mismatch.");
  }

  return true;
}

async function applyAuthenticator(
  policy: AuthenticationPolicy,
  ctx: Context,
  jwtPayload: JsonObject | null
): Promise<boolean> {
  switch (policy) {
    case AuthenticationPolicy.NONE: {
      return true;
    }

    case AuthenticationPolicy.LOGIN: {
      return jwtPayload ? true : false;
    }

    case AuthenticationPolicy.SAME_USER_ID_WITH_PATH_PARAM: {
      return sameUserIdWithPathParamCheck(ctx, jwtPayload);
    }

    default: {
      throw new Error(`Unknown authentication policy: ${policy}.`);
    }
  }
}

export function authenticationMiddleware(
  policy: AuthenticationPolicy = AuthenticationPolicy.LOGIN
): Middleware {
  const middleware: Middleware = async (ctx, next) => {
    const authorizationHeader = ctx.request.header.authorization;
    const jwtPayload = getJwtPayload(policy, authorizationHeader || "");

    const pass = await applyAuthenticator(policy, ctx, jwtPayload);
    if (pass) {
      await next();
    } else {
      throw new UserAuthenticationError();
    }
  };

  return middleware;
}

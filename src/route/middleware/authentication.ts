import { Middleware } from "koa";
import { Container } from "typedi";
import { JWT_SECRET_TOKEN } from "../../env";
import { UserAuthenticationError } from "../../error";
import jwt, { JsonWebTokenError } from "jsonwebtoken";
import { getJwtTokenFromHttpAuthenticationHeader } from "../../util";

export enum AuthenticationPolicy {
  NONE,
  LOGIN,
  SAME_USER_ID_FROM_PATH_PARAM,
}

export function authenticationMiddleware(
  policy: AuthenticationPolicy = AuthenticationPolicy.LOGIN
): Middleware {
  const middleware: Middleware = async (ctx, next) => {
    let pass = false;
    let jwtPayload = null;

    if (policy !== AuthenticationPolicy.NONE) {
      const authorizationHeader = ctx.request.header.authorization;
      if (authorizationHeader) {
        const token =
          getJwtTokenFromHttpAuthenticationHeader(authorizationHeader);
        if (token) {
          try {
            jwtPayload = jwt.verify(token, Container.get(JWT_SECRET_TOKEN));
          } catch (err) {
            if (err instanceof JsonWebTokenError) {
              // Something is wrong with pass-in token,
              // just do nothing and `jwtValid` flag keeps false
            } else {
              throw err;
            }
          }
        }
      }
    }

    switch (policy) {
      case AuthenticationPolicy.NONE: {
        pass = true;
        break;
      }

      case AuthenticationPolicy.LOGIN: {
        if (jwtPayload) {
          pass = true;
        }
        break;
      }

      case AuthenticationPolicy.SAME_USER_ID_FROM_PATH_PARAM: {
        const { userId } = ctx.params;
        if (!userId) {
          throw new Error("No `userId` is set in path params.");
        }

        if (!jwtPayload || typeof jwtPayload !== "object") {
          break;
        }

        if (!jwtPayload.userId) {
          throw new UserAuthenticationError(
            "No `userId` is set in JWT payload."
          );
        }

        if (userId !== jwtPayload.userId) {
          throw new UserAuthenticationError("`userId` mismatch.");
        }

        pass = true;
        break;
      }

      default: {
        throw new Error(`Unknown authentication policy: ${policy}.`);
      }
    }

    if (pass) {
      await next();
    } else {
      throw new UserAuthenticationError();
    }
  };

  return middleware;
}

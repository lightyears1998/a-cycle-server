import debug from "debug";

export const APP_NAME = "a-cycle-server";
export const APP_ROOT = __dirname;

export const logger = debug(APP_NAME);

export function isTrue(val: undefined | boolean | string) {
  if (typeof val === "undefined") {
    return false;
  }

  if (typeof val === "boolean") {
    return val;
  }

  if (Number(val) > 0) {
    return true;
  }

  const str = val.toLowerCase();
  for (const positiveWord of ["y", "yes", "true"]) {
    if (str === positiveWord) {
      return true;
    }
  }

  return false;
}

export function getProperName(object: unknown): string {
  switch (typeof object) {
    case "object":
      return object ? `[Object: ${object.constructor.name}]` : "[Object: null]";
    case "function":
      return `[Function: ${
        (object.prototype && object.prototype.name) || object.name
      }]`;
  }
  return String(object);
}

export function getJwtTokenFromHttpAuthenticationHeader(
  authorizationHeader: string
): string | null {
  const groups = /^Bearer (.*)$/gi.exec(authorizationHeader);
  const token = groups && groups[1];
  return token;
}

export function isDevelopmentEnvironment() {
  return process.env.NODE_ENV === "development";
}

export function gc() {
  if (!isDevelopmentEnvironment()) {
    logger(
      "Calling `gc` when not in development environment should be avoided.",
      new Error().stack
    );
  }

  if (typeof global.gc === "undefined") {
    throw new Error(
      "`global.gc` should be exposed during development by passing `--expose-gc` flag to node runtime."
    );
  }

  global.gc();
}

export function shouldGc(...objects: any[]) {
  const logger = debug(`${APP_NAME}:gc-check`);

  const refs = objects.map((obj) => {
    return new WeakRef(obj);
  });

  const objectNames = refs.map((ref) => getProperName(ref.deref())).join(", ");

  logger(`${objectNames}: checking...`);

  setTimeout(() => {
    gc();
    setTimeout(() => {
      for (const ref of refs) {
        if (typeof ref.deref() !== "undefined") {
          const errMsg = `${getProperName(
            ref.deref()
          )} error: has not been gc!`;
          logger(errMsg);
          if (isDevelopmentEnvironment()) {
            throw new Error(errMsg);
          }
        }
      }

      logger(`${objectNames}: done.`);
    }, 0);
  }, 0);
}

export function checkGcInDevelopment(...objects: any[]) {
  if (isDevelopmentEnvironment()) {
    shouldGc(...objects);
  }
}

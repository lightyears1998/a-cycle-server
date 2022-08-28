import debug from "debug";

export const logger = debug("a-cycle-server");

export function isTrue(val: string | undefined) {
  if (typeof val === "undefined") {
    return false;
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

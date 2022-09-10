import Router from "koa-router";
import { randomUUID, createHash } from "crypto";
import { BadParameterError } from "../error";
import moment from "moment";
import { validate as UuidValidate, version as UuidVersion } from "uuid";

const router = new Router();

router.get("/uuid", (ctx) => {
  ctx.body = {
    randomUuid: randomUUID(),
  };
});

router.get("/uuid/:uuidToVerified", (ctx) => {
  const { uuidToVerified } = ctx.params;

  const isValid = UuidValidate(uuidToVerified);
  let version: number | undefined = undefined;
  if (isValid) {
    version = UuidVersion(uuidToVerified);
  }

  ctx.body = {
    isValid,
    version,
  };
});

router.get("/sha256", (ctx) => {
  const { content } = ctx.query;
  if (typeof content == "undefined") {
    throw new BadParameterError(
      "`content` query string is required to provide sha256."
    );
  }
  const flatContent =
    typeof content === "object" ? content.flat().join("") : content;

  ctx.body = {
    sha256: createHash("sha256")
      .update(flatContent)
      .digest("hex")
      .toLowerCase(),
  };
});

router.get("/timestamp", (ctx) => {
  const date = new Date();
  ctx.body = {
    timestamp: date.toISOString(),
    unix: moment(date).unix(),
  };
});

router.get("/slow-response/:timeout", async (ctx) => {
  const { timeout } = ctx.params;
  let timeoutSeconds = Number(timeout);
  timeoutSeconds = Math.min(60, Math.max(0, timeoutSeconds));

  await new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutSeconds * 1000);
  });
  ctx.body = {};
});

export default router;

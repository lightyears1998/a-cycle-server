import Router from "koa-router";
import { randomUUID, createHash } from "crypto";
import { BadParameterError } from "../error";

const router = new Router();

router.get("/random-uuid", (ctx) => {
  ctx.body = {
    uuid: randomUUID(),
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
  ctx.body = {
    timestamp: new Date().toISOString(),
  };
});

export default router;

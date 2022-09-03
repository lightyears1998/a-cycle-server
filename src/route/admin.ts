import { Middleware } from "koa";
import Router from "koa-router";
import { Container } from "typedi";
import { ADMIN_TOKEN } from "../env";
import { AdminTokenAuthenticationError } from "../error";
import { MetadataService } from "../service/metadata";
import crypto from "crypto";
import { getManager } from "../db";
import { User } from "../entity/user";

const router = new Router();

const manager = getManager();
const metadataService = Container.get(MetadataService);

const adminAuthenticator: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.authorization;
  if (!authHeader) {
    throw new AdminTokenAuthenticationError("No authorization header.");
  }

  const passInTokenSha256 = authHeader.split("SHA256 ")[1];
  if (!passInTokenSha256) {
    throw new AdminTokenAuthenticationError(
      "Malformed Authorization header, which should be 'SHA256 ${token}'"
    );
  }

  const realToken = await metadataService.get(ADMIN_TOKEN);
  if (!realToken) {
    throw new AdminTokenAuthenticationError("Admin token is disabled.");
  }

  const realTokenSha256 = crypto
    .createHash("sha256")
    .update(Buffer.from(realToken, "utf8"))
    .digest("hex");

  if (passInTokenSha256.toLowerCase() !== realTokenSha256.toLowerCase()) {
    throw new AdminTokenAuthenticationError("Admin token incorrect.");
  }

  return next();
};

router.use(adminAuthenticator);

router.get("/", async (ctx) => {
  ctx.body = {
    message: "Admin Area.",
  };
});

router.get("/users", async (ctx) => {
  const users = await manager.find(User);
  ctx.body = { users: users };
});

export default router;

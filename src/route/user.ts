import Router from "koa-router";
import {
  authenticationMiddleware as authentication,
  AuthenticationPolicy,
} from "../middleware/authentication";
import bcrypt, { genSalt } from "bcrypt";
import {
  AdminTokenAuthenticationError,
  BadParameterError,
  UserAuthenticationError,
  UsernameAlreadyRegisteredError,
  UserNotFoundError,
  UserRegistrationProhibitedError,
} from "./error";
import { getManager } from "../db";
import { User } from "../entity/user";
import Container from "typedi";
import {
  ADMIN_TOKEN,
  JWT_SECRET_TOKEN,
  USER_REGISTRATION_ENABLED,
} from "../env";
import { UserService } from "../service/user";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { EntryService } from "../service/entry";
import { Entry } from "../entity/entry";
import { DeepPartial } from "typeorm";

const router = new Router();

// Check if a username exists
router.get("/", async (ctx) => {
  const username = String(ctx.query.username);

  if (username) {
    const user = await Container.get(UserService).getUserByUsername(username);
    if (user) {
      const maskedUser: Partial<User> = {};
      maskedUser.id = user.id;
      ctx.body = { user: maskedUser };
    } else {
      ctx.body = { user: {} };
    }
  }
});

// Register a new user
router.post("/", async (ctx) => {
  const { password, username } = ctx.request.body;

  if (!Container.get(USER_REGISTRATION_ENABLED)) {
    throw new UserRegistrationProhibitedError();
  }

  if (!password) {
    throw new BadParameterError("Password is required.");
  }

  if (!username) {
    throw new BadParameterError("Username is required.");
  }

  Container.get(UserService).checkPassword(password);

  const manager = getManager();

  let user = await Container.get(UserService).getUserByUsername(username);
  if (user) {
    throw new UsernameAlreadyRegisteredError();
  }

  user = manager.create(User);
  user.username = username;
  user.passwordHash = await bcrypt.hash(password, await bcrypt.genSalt());

  user = await manager.save(user);

  const maskedUser: Partial<User> = user;
  maskedUser.passwordHash = undefined;
  ctx.body = { user: maskedUser };
});

// Request JWT Token (aka. User login)
router.post("/:userId/jwt-tokens", async (ctx) => {
  const { userId } = ctx.params;
  const { password } = ctx.request.body;

  console.log(userId, ctx.request.body);

  if (!password) {
    throw new BadParameterError("Password is required.");
  }

  const manager = getManager();
  const user = await manager.findOne(User, { where: { id: userId } });

  if (!user) {
    throw new UserNotFoundError();
  }

  const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordsMatch) {
    throw new UserAuthenticationError();
  }

  const token = jwt.sign({ userId }, Container.get(JWT_SECRET_TOKEN));
  ctx.body = { token };
});

// Reset password
router.get("/:userId/password/reset", async (ctx) => {
  const { userId } = ctx.params;
  const { adminToken, password } = ctx.request.body;

  if (!adminToken) {
    throw new BadParameterError("AdminToken must be provided.");
  }

  if (adminToken !== Container.get(ADMIN_TOKEN)) {
    throw new AdminTokenAuthenticationError();
  }

  if (!password) {
    throw new BadParameterError("Password is required.");
  }

  const manager = getManager();
  let user = await manager.findOne(User, { where: { id: userId } });
  if (!user) {
    throw new UserNotFoundError();
  }

  user.passwordHash = await bcrypt.hash(password, await genSalt());
  user = await manager.save(user);

  const maskedUser: Partial<User> = {
    id: user.id,
    username: user.username,
  };
  ctx.body = {
    user: maskedUser,
  };
});

const protectedRouter = new Router();

protectedRouter.use(
  authentication(AuthenticationPolicy.SAME_USER_ID_FROM_PATH_PARAM)
);

// Update password
protectedRouter.put("/:userId/password", async (ctx) => {
  const { userId } = ctx.params;
  const { password } = ctx.request.body;

  if (!password) {
    throw new BadParameterError("Password is required.");
  }

  Container.get(UserService).checkPassword(password);

  const manager = getManager();
  let user = await manager.findOne(User, { where: { id: userId } });
  if (!user) {
    throw new UserNotFoundError();
  }

  user.passwordHash = await bcrypt.hash(password, await bcrypt.genSalt());
  user = await manager.save(user);

  const maskedUser: Partial<User> = {
    id: user.id,
  };
  ctx.body = { user: maskedUser };
});

// Get entries
protectedRouter.get("/:userId/entries", (ctx) => {
  console.log(ctx.query);

  ctx.body = "ok";
});

// Get an entry
protectedRouter.get("/:userId/entries/:entryId", (ctx) => {
  return;
});

// Create an entry
protectedRouter.post("/:userId/entries", async (ctx) => {
  const { userId } = ctx.params;
  const { contentType, content, updatedAt, updatedBy } = ctx.request.body;

  let entry: DeepPartial<Entry> = {
    contentType,
    content,
    updatedAt,
    updatedBy,
  };
  entry.owner = {
    id: userId,
  };

  Container.get(EntryService).checkEntry(entry);

  const manager = getManager();
  entry = await manager.save(entry);

  ctx.body = { entry };
});

// Update an entry
protectedRouter.put("/:userId/entries", (ctx) => {
  return;
});

// Remove an entry
protectedRouter.del("/:userId/entries/:entryId", (ctx) => {
  return;
});

// Get metadata for syncing entries across clients (sync-recent algorithm)
protectedRouter.get("/:userId/sync-recent", (ctx) => {
  return;
});

// Get metadata for syncing entries across clients (sync-full algorithm)
protectedRouter.get("/:userId/sync-full", (ctx) => {
  return;
});

router.use(protectedRouter.routes(), protectedRouter.allowedMethods());

export default router;

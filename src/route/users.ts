import Router from "koa-router";
import {
  authenticationMiddleware as authentication,
  AuthenticationPolicy,
} from "./middleware/authentication";
import bcrypt, { genSalt } from "bcrypt";
import {
  AdminTokenAuthenticationError,
  BadParameterError,
  UserAuthenticationError,
  UsernameAlreadyRegisteredError,
  UserNotFoundError,
  UserRegistrationProhibitedError,
} from "../error";
import { getManager } from "../db";
import { User } from "../entity/user";
import { Container } from "typedi";
import {
  ADMIN_TOKEN,
  JWT_SECRET_TOKEN,
  SERVER_UUID,
  TRANSMISSION_PAGING_SIZE,
  USER_REGISTRATION_ENABLED,
} from "../env";
import { UserService } from "../service/user";
import jwt from "jsonwebtoken";
import { EntryService } from "../service/entry";
import { Entry } from "../entity/entry";
import { In, IsNull } from "typeorm";

const router = new Router();

const serverUuid = Container.get(SERVER_UUID);
const manager = getManager();
const userService = Container.get(UserService);
const entryService = Container.get(EntryService);

// Check if a username exists
router.get("/", async (ctx) => {
  const username = String(ctx.query.username);

  if (username) {
    const user = await userService.getUserByUsername(username);
    if (user) {
      ctx.body = { user: user.toPlain() };
    } else {
      ctx.body = { user: {} };
    }
  }
});

// Register a new user
router.post("/", async (ctx) => {
  const { passwordSha256, username } = ctx.request.body;

  if (!Container.get(USER_REGISTRATION_ENABLED)) {
    throw new UserRegistrationProhibitedError();
  }

  if (!passwordSha256) {
    throw new BadParameterError("`passwordSha256` is required.");
  }

  if (!username) {
    throw new BadParameterError("`username` is required.");
  }

  let user = await userService.getUserByUsername(username);
  if (user) {
    throw new UsernameAlreadyRegisteredError();
  }

  user = manager.create(User, {
    username,
    passwordHash: await bcrypt.hash(passwordSha256, await bcrypt.genSalt()),
  });
  user = await manager.save(user);

  ctx.body = { user: user.toPlain() };
});

// Request JWT Token (aka. User login)
router.post("/:userId/jwt-tokens", async (ctx) => {
  const { userId } = ctx.params;
  const { passwordSha256 } = ctx.request.body;

  if (!passwordSha256) {
    throw new BadParameterError("`passwordSha256` is required.");
  }

  const user = await manager.findOne(User, {
    where: { id: userId, removedAt: IsNull() },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  const passwordsMatched = await bcrypt.compare(
    passwordSha256,
    user.passwordHash
  );
  if (!passwordsMatched) {
    throw new UserAuthenticationError();
  }

  const token = jwt.sign({ userId }, Container.get(JWT_SECRET_TOKEN));
  ctx.body = { token };
});

// Reset password
router.get("/:userId/password/reset", async (ctx) => {
  const { userId } = ctx.params;
  const { adminToken, passwordSha256 } = ctx.request.body;

  if (!adminToken) {
    throw new BadParameterError("`adminToken` is required.");
  }

  if (adminToken !== Container.get(ADMIN_TOKEN)) {
    throw new AdminTokenAuthenticationError();
  }

  if (!passwordSha256) {
    throw new BadParameterError("`passwordSha256` is required.");
  }

  let user = await manager.findOne(User, {
    where: { id: userId, removedAt: IsNull() },
  });
  if (!user) {
    throw new UserNotFoundError();
  }

  user.passwordHash = await bcrypt.hash(passwordSha256, await genSalt());
  user = await manager.save(user);

  ctx.body = {
    user: user.toPlain(),
  };
});

const protectedRouter = new Router();

protectedRouter.use(
  "/:userId",
  authentication(AuthenticationPolicy.SAME_USER_ID_FROM_PATH_PARAM)
);

// Update password
protectedRouter.put("/:userId/password", async (ctx) => {
  const { userId } = ctx.params;
  const { passwordSha256 } = ctx.request.body;

  if (!passwordSha256) {
    throw new BadParameterError("`passwordSha256` is required.");
  }

  let user = await manager.findOne(User, {
    where: { id: userId, removedAt: IsNull() },
  });
  if (!user) {
    throw new UserNotFoundError();
  }

  user.passwordHash = await bcrypt.hash(passwordSha256, await bcrypt.genSalt());
  user = await manager.save(user);

  ctx.body = { user: user.toPlain() };
});

// Get entries
protectedRouter.get("/:userId/entries", async (ctx) => {
  const { userId } = ctx.params;
  const { uid, page = 1 } = ctx.query;

  const manager = getManager();
  const entries = await manager.find(Entry, {
    where: {
      user: {
        id: userId,
      },
      uuid: uid ? In(Array(uid).flat()) : undefined,
      removedAt: IsNull(),
    },
    skip: (Number(page) - 1) * TRANSMISSION_PAGING_SIZE,
    take: TRANSMISSION_PAGING_SIZE,
  });

  ctx.body = { entries: entries.map((entry) => entry.toPlain()) };
});

// Get an entry
protectedRouter.get("/:userId/entries/:entryUuid", async (ctx) => {
  const { userId, entryUuid } = ctx.params;

  const entry = await entryService.getEntryOfUserByUuid(entryUuid, userId);

  ctx.body = {
    entry: entry ? entry.toPlain() : entry,
  };
});

// Create an entry
protectedRouter.post("/:userId/entries", async (ctx) => {
  const { userId } = ctx.params;
  const createdAt = new Date();

  const entry = manager.create(
    Entry,
    Object.assign({}, ctx.request.body, {
      user: { id: userId },
      createdAt: createdAt,
      updatedAt: createdAt,
      updatedBy: serverUuid,
    })
  ) as Partial<Entry>;

  const savedEntry = await entryService.createEntry(entry);

  ctx.body = { entry: savedEntry.toPlain() };
});

// Update an entry
protectedRouter.put("/:userId/entries/:entryUuid", async (ctx) => {
  const { userId, entryUuid } = ctx.params;
  const updatedAt = new Date();

  const entry = await entryService.getEntryOfUserByUuid(entryUuid, userId);
  if (!entry) {
    ctx.body = {
      entry: null,
    };
    return;
  }

  Object.assign(entry, ctx.request.body, {
    uuid: entryUuid,
    user: { id: userId },
    updatedAt: updatedAt,
    updatedBy: serverUuid,
  });

  const savedEntry = await entryService.updateEntry(entry);

  ctx.body = {
    entry: savedEntry.toPlain(),
  };
});

// Remove an entry
protectedRouter.del("/:userId/entries/:entryUuid", async (ctx) => {
  const { userId, entryUuid } = ctx.params;

  const manager = getManager();
  let entry = await manager.findOne(Entry, {
    where: { uuid: entryUuid, user: { id: userId }, removedAt: IsNull() },
  });

  if (!entry) {
    ctx.body = {
      entry: {},
    };
    return;
  }

  entry = await entryService.removeEntry(entry);
  ctx.body = {
    entry: entry.toPlain(),
  };
});

router.use(protectedRouter.routes(), protectedRouter.allowedMethods());

export default router;

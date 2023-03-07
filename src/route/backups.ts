import Router from "koa-router";
import { getManager } from "../db";
import { Backup } from "../entity/backup";
import { BadParameterError } from "../error";

const router = new Router();
const manager = getManager();

router.get("/:backupUuid", async (ctx) => {
  const { backupUuid } = ctx.params;
  const backup = await manager.findOne(Backup, {
    where: {
      uuid: backupUuid,
    },
  });

  if (!backup) {
    ctx.body = "Backup is not found.";
    return;
  }

  ctx.body = backup.content;
});

router.post("/", async (ctx) => {
  const { content } = ctx.request.body as any;
  if (!content) {
    throw new BadParameterError("`content` is required.");
  }

  let backup = manager.create(Backup, { content });
  backup = await manager.save(backup);

  ctx.body = backup.uuid;
});

export default router;

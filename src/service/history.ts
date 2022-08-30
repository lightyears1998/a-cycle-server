import { Inject, Service } from "typedi";
import { EntityManager } from "typeorm";
import { Entry } from "../entity/entry";
import { History, EntryOperation, HistoryCursor } from "../entity/history";

type UnwrittenHistory = Omit<History, "id" | "lastId">;

@Service()
export class HistoryService {
  @Inject()
  private manager!: EntityManager;

  private readonly MAX_RETRY = 10;

  private queue: Array<UnwrittenHistory> = [];

  get queueIsProcessing(): boolean {
    return this.queue.length > 0;
  }

  private async processQueue() {
    while (this.queueIsProcessing) {
      const unwrittenHistory = this.queue.shift();
      if (!unwrittenHistory) {
        break;
      }

      let attemptCount = 0;
      while (attemptCount < this.MAX_RETRY) {
        try {
          await this.manager.transaction("SERIALIZABLE", async (manager) => {
            const { lastHistoryId } = await manager
              .createQueryBuilder(History, "history")
              .select([])
              .addSelect("COALESCE(MAX(history.id), 0)", "lastHistoryId")
              .where({
                user: unwrittenHistory.user,
              })
              .getRawOne();

            const history = manager.create(
              History,
              Object.assign({}, unwrittenHistory, {
                lastId: Number(lastHistoryId),
              })
            );

            await this.manager.save(history);
          });

          break;
        } catch (err) {
          attemptCount++;

          if (attemptCount >= this.MAX_RETRY) {
            throw err;
          }
        }
      }
    }
  }

  commitEntryOperation(entry: Entry, operation: EntryOperation) {
    const unwrittenHistory = this.manager.create(History, {
      user: entry.owner,
      operation,
      entryId: entry.uid,
      entryUpdatedAt: entry.updatedAt,
      entryUpdatedBy: entry.updatedBy,
    }) as UnwrittenHistory;

    this.queue.push(unwrittenHistory);
    this.processQueue();
  }

  async locateHistoryCursor(
    unverifiedHistoryCursor: Partial<History>
  ): Promise<History | null> {
    const cursor = await this.manager.findOne(History, {
      where: {
        user: Object(unverifiedHistoryCursor.user),
        id: Number(unverifiedHistoryCursor.id),
        entryId: String(unverifiedHistoryCursor.entryId),
        entryUpdatedAt: new Date(
          String(unverifiedHistoryCursor.entryUpdatedAt)
        ),
        entryUpdatedBy: String(unverifiedHistoryCursor.entryUpdatedBy),
      },
    });
    return cursor;
  }

  async getLastestCursor(userId: string): Promise<HistoryCursor | null> {
    const history = await this.manager.findOne(History, {
      where: {
        user: {
          id: userId,
        },
      },
      order: {
        id: "DESC",
      },
    });

    return history ? history.toCursor() : null;
  }
}

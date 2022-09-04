import { Inject, Service } from "typedi";
import { EntityManager } from "typeorm";
import { Entry } from "../entity/entry";
import {
  EntryHistory,
  EntryOperation,
  HistoryCursor,
} from "../entity/entry-history";

type UnwrittenHistory = Omit<EntryHistory, "id" | "lastId">;

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
              .createQueryBuilder(EntryHistory, "history")
              .select([])
              .addSelect("COALESCE(MAX(history.id), 0)", "lastHistoryId")
              .where({
                user: unwrittenHistory.user,
              })
              .getRawOne();

            const history = manager.create(
              EntryHistory,
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
    const unwrittenHistory = this.manager.create(EntryHistory, {
      user: entry.user,
      entryOperation: operation,
      entryId: entry.uuid,
      entryUpdatedAt: entry.updatedAt,
      entryUpdatedBy: entry.updatedBy,
    }) as UnwrittenHistory;

    this.queue.push(unwrittenHistory);
    this.processQueue();
  }

  async locateHistoryCursorOfUser(
    unverifiedHistoryCursor: Partial<EntryHistory>,
    userId: string
  ): Promise<EntryHistory | null> {
    const cursor = await this.manager.findOne(EntryHistory, {
      where: {
        user: {
          id: userId,
        },
        id: String(unverifiedHistoryCursor.id),
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
    const history = await this.manager.findOne(EntryHistory, {
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

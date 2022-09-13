import debug from "debug";
import { Inject, Service } from "typedi";
import { EntityManager } from "typeorm";
import { Entry } from "../entity/entry";
import {
  EntryHistory,
  EntryOperation,
  HistoryCursor,
} from "../entity/entry-history";
import { User } from "../entity/user";

type UnwrittenHistory = Omit<EntryHistory, "id" | "lastId">;
type OnSavedCallback = (savedHistory: EntryHistory) => void;
type UserId = string;

@Service()
export class HistoryService {
  @Inject()
  private manager!: EntityManager;

  private readonly MAX_RETRY = 10;

  private logger = debug("a-cycle-server:entry-history");
  private queue: Array<[UnwrittenHistory, OnSavedCallback]> = [];

  private processingCount = new Map<UserId, number>();

  get queueIsProcessing(): boolean {
    return this.queue.length > 0;
  }

  private increaseProcessingCount(userId: UserId) {
    if (!this.processingCount.get(userId)) {
      this.processingCount.set(userId, 0);
      this.logger(`Starting procession for user ${userId}.`);
      this.processQueue();
    }
    this.processingCount.set(
      userId,
      (this.processingCount.get(userId) as number) + 1
    );
  }

  private decreaseProcessingCount(userId: UserId) {
    this.processingCount.set(
      userId,
      (this.processingCount.get(userId) as number) - 1
    );
    if (!this.processingCount.get(userId)) {
      this.processingCount.delete(userId);
      this.logger(`Finishing procession for user ${userId}.`);
    }
  }

  private async processQueue() {
    this.logger(
      `Triggered queue processing. (Expected queue length: 1, actual queue length: ${this.queue.length})`
    );

    while (this.queueIsProcessing) {
      this.logger(`Remaining queue length: ${this.queue.length}`);
      const [unwrittenHistory, onSavedCallback] = this.queue.shift() as [
        UnwrittenHistory,
        OnSavedCallback
      ];

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
                parentId: String(lastHistoryId),
              } as Pick<EntryHistory, "parentId">)
            ) as EntryHistory;

            const savedHistory = await manager.save(EntryHistory, history);
            onSavedCallback(savedHistory);
            this.decreaseProcessingCount(savedHistory.user.id);
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
      entryUuid: entry.uuid,
      entryUpdatedAt: entry.updatedAt,
      entryUpdatedBy: entry.updatedBy,
    }) as UnwrittenHistory;

    const userId = (entry.user as Pick<User, "id">).id;
    return new Promise<EntryHistory>((resolve) => {
      this.queue.push([unwrittenHistory, resolve]);
      this.increaseProcessingCount(userId);
    });
  }

  async locateHistoryCursorOfUser(
    unverifiedHistoryCursor: Partial<EntryHistory>,
    userId: string
  ): Promise<EntryHistory | null> {
    if (
      !unverifiedHistoryCursor.id ||
      !unverifiedHistoryCursor.entryUuid ||
      !unverifiedHistoryCursor.entryUpdatedAt ||
      !unverifiedHistoryCursor.entryUpdatedBy
    ) {
      return null;
    }

    const cursor = await this.manager.findOne(EntryHistory, {
      where: {
        user: {
          id: userId,
        },
        id: String(unverifiedHistoryCursor.id),
        entryUuid: String(unverifiedHistoryCursor.entryUuid),
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

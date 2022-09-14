import { Inject, Service } from "typedi";
import { EntityManager, In, IsNull } from "typeorm";
import { Entry, EntryMetadata, PlainEntry } from "../entity/entry";
import { EntryOperation } from "../entity/entry-history";
import { User } from "../entity/user";
import { HistoryService } from "./history";

@Service()
export class EntryService {
  @Inject()
  private manager!: EntityManager;

  @Inject()
  private historyService!: HistoryService;

  private async saveEntry(
    entry: Partial<Entry>,
    operation: EntryOperation
  ): Promise<Entry> {
    await this.historyService.commitEntryOperation(entry as Entry, operation);
    const savedEntry = await this.manager.save(Entry, entry);
    return savedEntry;
  }

  async getEntryOfUserByUuid(
    entryUuid: string,
    userId: string
  ): Promise<Entry | null> {
    return this.manager.findOne(Entry, {
      where: {
        uuid: entryUuid,
        user: {
          id: userId,
        },
        removedAt: IsNull(),
      },
    });
  }

  isFresher(
    newEntry: EntryMetadata,
    oldEntry: EntryMetadata | undefined
  ): boolean {
    if (!oldEntry) {
      return true;
    }

    return new Date(newEntry.updatedAt) > new Date(oldEntry.updatedAt);
  }

  async createEntry(entry: Partial<Entry>): Promise<Entry> {
    return this.saveEntry(entry, EntryOperation.CREATE);
  }

  async updateEntry(entry: Partial<Entry>): Promise<Entry> {
    return this.saveEntry(entry, EntryOperation.UPDATE);
  }

  async removeEntry(entry: Partial<Entry>): Promise<Entry> {
    entry.removedAt = new Date();
    return this.saveEntry(entry, EntryOperation.UPDATE);
  }

  async saveEntryIfNewOrFresher(userId: string, entry: PlainEntry) {
    const oldEntry = await this.manager.findOne(Entry, {
      where: {
        user: {
          id: userId,
        },
        uuid: entry.uuid,
      },
    });

    let shouldSave = false;
    if (!oldEntry) {
      shouldSave = true;
    } else {
      shouldSave = this.isFresher(entry, oldEntry);
    }

    if (shouldSave) {
      return this.updateEntry(
        this.manager.create(
          Entry,
          Object.assign({}, oldEntry, entry, {
            user: { id: userId },
          } as Partial<User>)
        )
      );
    }
  }

  async filterFresherEntryMetadata(
    metadata: EntryMetadata[]
  ): Promise<EntryMetadata[]> {
    const uuids = metadata.map((meta) => meta.uuid);
    const relatedEntries = await this.manager.find(Entry, {
      where: {
        uuid: In(uuids),
      },
    });

    const kvArray = relatedEntries.map(
      (entry) => [entry.uuid, entry] as [string, Entry]
    );
    const uidMap = new Map(kvArray);

    return metadata.filter((meta) =>
      this.isFresher(meta, uidMap.get(meta.uuid))
    );
  }
}

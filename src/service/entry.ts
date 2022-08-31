import { Inject, Service } from "typedi";
import { EntityManager, In } from "typeorm";
import { Entry, EntryMetadata, PlainEntry } from "../entity/entry";
import { EntryOperation } from "../entity/entry-history";
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
    const savedEntry = await this.manager.save(Entry, entry);
    this.historyService.commitEntryOperation(entry as Entry, operation);
    return savedEntry;
  }

  isFresher(
    newEntry: EntryMetadata,
    oldEntry: EntryMetadata | undefined
  ): boolean {
    if (!oldEntry) {
      return true;
    }

    return (
      newEntry.updatedAt > oldEntry.updatedAt ||
      (newEntry.updatedAt === oldEntry.updatedAt &&
        newEntry.updatedBy > oldEntry.updatedBy)
    );
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

  async updateEntryIfFresher(userId: string, entry: PlainEntry) {
    const oldEntry = await this.manager.findOne(Entry, {
      where: {
        user: {
          id: userId,
        },
        uuid: entry.uuid,
      },
    });
    if (!oldEntry) {
      return;
    }

    if (this.isFresher(entry, oldEntry)) {
      return this.updateEntry(
        this.manager.create(Entry, Object.assign({}, oldEntry, entry))
      );
    }
  }

  async filterFresherEntryMetadata(
    metadata: EntryMetadata[]
  ): Promise<EntryMetadata[]> {
    const uids = metadata.map((meta) => meta.uuid);
    const relatedEntries = await this.manager.find(Entry, {
      where: {
        uuid: In(uids),
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

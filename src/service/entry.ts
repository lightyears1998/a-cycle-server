import { Inject, Service } from "typedi";
import { DeepPartial, EntityManager, In } from "typeorm";
import { Entry, EntryMetadata, PlainEntry } from "../entity/entry";
import { EntryOperation } from "../entity/entry-history";
import { EntryInvalidError } from "../error";
import { HistoryService } from "./history";

@Service()
export class EntryService {
  @Inject()
  private manager!: EntityManager;

  @Inject()
  private historyService!: HistoryService;

  checkEntry(entry: DeepPartial<Entry>) {
    const props = [
      "uid",
      "owner",
      "type",
      "title",
      "description",
      "isTransient",
      "updatedAt",
      "updatedBy",
    ] as Array<keyof Entry>;

    if (typeof entry !== "object") {
      throw new EntryInvalidError();
    }

    for (const prop of props) {
      if (!(prop in entry) || typeof entry[prop] === "undefined") {
        throw new EntryInvalidError(`\`${prop}\` field is required.`);
      }
    }

    if (
      typeof entry.user !== "object" ||
      typeof entry.user.id === "undefined"
    ) {
      throw new EntryInvalidError();
    }
  }

  private async saveEntry(entry: Partial<Entry>, operation: EntryOperation) {
    entry = await this.manager.save(entry);
    this.historyService.commitEntryOperation(entry as Entry, operation);
    return entry;
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

  async createEntry(entry: Partial<Entry>) {
    return this.saveEntry(entry, EntryOperation.CREATE_ENTRY);
  }

  async updateEntry(entry: Partial<Entry>) {
    return this.saveEntry(entry, EntryOperation.UPDATE_ENTRY);
  }

  async removeEntry(entry: Partial<Entry>) {
    entry.isRemoved = true;
    return this.saveEntry(entry, EntryOperation.REMOVE_ENTRY);
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

  async filterFresherMetadata(
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

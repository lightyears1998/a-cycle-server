import { Inject, Service } from "typedi";
import { DeepPartial, EntityManager } from "typeorm";
import { Entry, PlainEntry } from "../entity/entry";
import { EntryOperation } from "../entity/history";
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
      typeof entry.owner !== "object" ||
      typeof entry.owner.id === "undefined"
    ) {
      throw new EntryInvalidError();
    }
  }

  private async saveEntry(entry: Partial<Entry>, operation: EntryOperation) {
    entry = await this.manager.save(entry);
    this.historyService.commitEntryOperation(entry as Entry, operation);
    return entry;
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
        owner: {
          id: userId,
        },
        uid: entry.uid,
      },
    });
    if (!oldEntry) {
      return;
    }

    if (
      entry.updatedAt > oldEntry.updatedAt ||
      (entry.updatedAt === oldEntry.updatedAt &&
        entry.updatedBy > oldEntry.updatedBy)
    ) {
      return this.updateEntry(
        this.manager.create(Entry, Object.assign({}, oldEntry, entry))
      );
    }
  }
}

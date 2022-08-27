import { Service } from "typedi";
import { DeepPartial } from "typeorm";
import { getManager } from "../db";
import { Entry } from "../entity/entry";
import { EntryOperation, History } from "../entity/history";
import { EntryInvalidError } from "../route/error";

@Service()
export class EntryService {
  private manager = getManager();

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

  async removeEntry(entry: Entry) {
    entry.isRemoved = true;

    let history = this.manager.create(History, {
      user: entry.owner,
      entry: entry,
      operation: EntryOperation.REMOVE_ENTRY,
      date: new Date(),
    } as Partial<History>); // @TODO Use query builder to handle history `lastId` creation.

    await this.manager.transaction(async (manager) => {
      await manager.save(entry);
      history = await manager.save(history);
    });

    return history;
  }
}

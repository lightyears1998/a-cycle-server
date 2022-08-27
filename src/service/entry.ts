import { Service } from "typedi";
import { DeepPartial } from "typeorm";
import { Entry } from "../entity/entry";
import { EntryInvalidError } from "../route/error";

@Service()
export class EntryService {
  checkEntry(entry: DeepPartial<Entry>) {
    const props = [
      "uid",
      "owner",
      "content",
      "contentType",
      "updatedAt",
      "updatedBy",
    ] as Array<keyof Entry>;

    if (typeof entry !== "object") {
      throw new EntryInvalidError();
    }

    for (const prop of props) {
      if (!(prop in entry) || typeof entry[prop] === "undefined") {
        throw new EntryInvalidError();
      }
    }

    if (
      typeof entry.owner !== "object" ||
      typeof entry.owner.id === "undefined"
    ) {
      throw new EntryInvalidError();
    }
  }
}

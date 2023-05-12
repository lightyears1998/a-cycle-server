import type { JsonValue } from "type-fest";
import { Inject, Service, Token } from "typedi";
import { EntityManager } from "typeorm";
import { ServerStorage } from "../entity/server-storage";
import { metadataTuples } from "../metadata";

@Service()
export class MetadataService {
  @Inject()
  private manager!: EntityManager;

  async get<T extends JsonValue>(metaToken: Token<T>): Promise<T | null> {
    const matchedTuple = metadataTuples
      .filter((tuple) => tuple[0] === metaToken)
      .shift();

    if (matchedTuple) {
      const [_, key, defaultValue] = matchedTuple;
      const storage = await this.manager.findOne(ServerStorage, {
        where: {
          key: key,
        },
      });

      return storage ? (storage.value as T) : (defaultValue as T);
    }

    return null;
  }
}

import { Inject, Service } from "typedi";
import { EntityManager } from "typeorm";
import { Node } from "../entity/node";
import { HistoryCursor } from "../entity/entry-history";

@Service()
export class NodeService {
  @Inject()
  private manager!: EntityManager;

  async updateClientHistoryCursor(
    userId: string,
    clientId: string,
    historyCursor: HistoryCursor
  ) {
    await this.manager.update(
      Node,
      {
        uid: clientId,
        user: {
          id: userId,
        },
      },
      {
        historyCursor,
      }
    );
  }
}

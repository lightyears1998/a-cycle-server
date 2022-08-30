import { Inject, Service } from "typedi";
import { EntityManager } from "typeorm";
import { Client } from "../entity/client";
import { HistoryCursor } from "../entity/history";

@Service()
export class ClientService {
  @Inject()
  private manager!: EntityManager;

  async updateClientHistoryCursor(
    userId: string,
    clientId: string,
    historyCursor: HistoryCursor
  ) {
    await this.manager.update(
      Client,
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

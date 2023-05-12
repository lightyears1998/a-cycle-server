import { EntityManager } from "typeorm";
import { getManager } from "../db";
import { UserService } from "../service/user";
import Container from "typedi";
import { HistoryService } from "../service/history";
import { NodeService } from "../service/node";
import { EntryService } from "../service/entry";

export class SyncService {
  public manager: EntityManager;
  public user: UserService;
  public history: HistoryService;
  public node: NodeService;
  public entry: EntryService;

  public constructor() {
    this.manager = getManager();
    this.user = Container.get(UserService);
    this.history = Container.get(HistoryService);
    this.node = Container.get(NodeService);
    this.entry = Container.get(EntryService);
  }
}

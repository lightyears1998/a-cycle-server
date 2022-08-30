import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { HistoryCursor } from "./history";
import { User } from "./user";

@Entity()
export class Client {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Column({ type: "uuid" })
  uid!: string;

  @ManyToOne(() => User)
  user!: User;

  /**
   * JSON-format history cursor
   */
  @Column({ type: "json", default: "{}" })
  historyCursor!: HistoryCursor;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { HistoryCursor } from "./entry-history";
import { User } from "./user";

export type PlainNode = Pick<Node, "uuid" | "historyCursor">;

@Entity()
export class Node {
  @PrimaryGeneratedColumn("increment", { type: "int8" })
  public id!: string;

  @Column({ type: "uuid" })
  public uuid!: string;

  @ManyToOne(() => User)
  public user!: User;

  @Column({ type: "jsonb", default: "null" })
  public historyCursor!: HistoryCursor;

  @CreateDateColumn({ type: "timestamptz" })
  public createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  public updatedAt!: Date;
}

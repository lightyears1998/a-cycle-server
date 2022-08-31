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
  id!: string;

  @Column({ type: "uuid" })
  uuid!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column({ type: "json", default: "null" })
  historyCursor!: HistoryCursor;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

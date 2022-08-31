import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { SoftDeletableObject } from "./interface/soft-deletable-object";

export type PlainUser = Pick<User, "id" | "username">;

@Entity()
@Unique("UNIQUE_USERNAME", ["username"])
export class User implements SoftDeletableObject {
  @PrimaryGeneratedColumn("increment", { type: "int8" })
  id!: string;

  @Column()
  username!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: "timestamptz", nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  toPlain(): PlainUser {
    return {
      id: this.id,
      username: this.username,
    };
  }
}

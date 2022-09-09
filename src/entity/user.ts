import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { SoftRemovableObject } from "./interface/soft-removable-object";

export type PlainUser = Pick<User, "id" | "username">;

@Entity()
@Unique("UNIQUE_USERNAME", ["username"])
export class User implements SoftRemovableObject {
  @PrimaryGeneratedColumn("increment", { type: "int8" })
  id!: string;

  @Column({ type: "timestamptz", nullable: true })
  removedAt!: Date | null;

  @Column()
  username!: string;

  @Column()
  passwordHash!: string;

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

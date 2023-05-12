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
  public id!: string;

  @Column({ type: "timestamptz", nullable: true })
  public removedAt!: Date | null;

  @Column()
  public username!: string;

  @Column()
  public passwordHash!: string;

  @CreateDateColumn()
  public createdAt!: Date;

  @UpdateDateColumn()
  public updatedAt!: Date;

  public toPlain(): PlainUser {
    return {
      id: this.id,
      username: this.username,
    };
  }
}

import type { JsonValue } from "type-fest";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SoftRemovableObject } from "./interface/soft-removable-object";
import { User } from "./user";

export type PlainEntry = Omit<Entry, "user" | "toPlain" | "getMetadata">;

export type EntryMetadata = Pick<
  PlainEntry,
  "uuid" | "createdAt" | "updatedAt" | "updatedBy"
>;

@Entity()
export class Entry implements SoftRemovableObject {
  @PrimaryGeneratedColumn("uuid")
  uuid!: string;

  @ManyToOne(() => User, { nullable: false })
  user?: User;

  @Column({ type: "timestamptz", nullable: true })
  removedAt!: Date | null;

  @Column({ nullable: false })
  contentType!: string;

  @Column({ type: "jsonb", default: "null" })
  content!: JsonValue;

  @Column({
    type: "timestamptz",
    nullable: false,
    default: () => "NOW()",
  })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: false })
  updatedAt!: Date;

  @Column({ type: "uuid", nullable: false })
  updatedBy!: string;

  toPlain(): PlainEntry {
    return {
      uuid: this.uuid,
      contentType: this.contentType,
      content: this.content,
      removedAt: this.removedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }

  getMetadata(): EntryMetadata {
    return {
      uuid: this.uuid,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }
}

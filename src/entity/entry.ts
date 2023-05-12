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
  public uuid!: string;

  @ManyToOne(() => User, { nullable: false })
  public user?: User;

  @Column({ type: "timestamptz", nullable: true })
  public removedAt!: Date | null;

  @Column({ nullable: false })
  public contentType!: string;

  @Column({ type: "jsonb", default: "null" })
  public content!: JsonValue;

  @Column({
    type: "timestamptz",
    nullable: false,
    default: () => "NOW()",
  })
  public createdAt!: Date;

  @Column({ type: "timestamptz", nullable: false })
  public updatedAt!: Date;

  @Column({ type: "uuid", nullable: false })
  public updatedBy!: string;

  public toPlain(): PlainEntry {
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

  public getMetadata(): EntryMetadata {
    return {
      uuid: this.uuid,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }
}

import { IsDate, IsNumber, IsString, IsUUID } from "class-validator";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user";

export enum EntryOperation {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
}

export type PlainEntryHistory = Omit<
  EntryHistory,
  "user" | "toPlain" | "toCursor"
>;

export class HistoryCursor
  implements
    Pick<EntryHistory, "id" | "entryId" | "entryUpdatedAt" | "entryUpdatedBy">
{
  @IsNumber()
  id!: string;

  @IsString()
  entryId!: string;

  @IsDate()
  entryUpdatedAt!: Date;

  @IsUUID(4)
  entryUpdatedBy!: string;

  constructor(id: string, entryId: string, at: Date, by: string) {
    this.id = id;
    this.entryId = entryId;
    this.entryUpdatedAt = at;
    this.entryUpdatedBy = by;
  }
}

@Entity()
export class EntryHistory {
  @PrimaryGeneratedColumn("increment", { type: "int8" })
  id!: string;

  @Column({ type: "int8", default: 0 })
  parentId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column({ type: "uuid" })
  entryId!: string;

  @Column({
    type: "enum",
    enum: EntryOperation,
  })
  entryOperation!: EntryOperation;

  @Column({ type: "timestamptz" })
  entryUpdatedAt!: Date;

  @Column({ type: "uuid" })
  entryUpdatedBy!: string;

  toPlain(): PlainEntryHistory {
    return {
      id: this.id,
      parentId: this.parentId,
      entryId: this.entryId,
      entryOperation: this.entryOperation,
      entryUpdatedAt: this.entryUpdatedAt,
      entryUpdatedBy: this.entryUpdatedBy,
    };
  }

  toCursor() {
    return new HistoryCursor(
      this.id,
      this.entryId,
      this.entryUpdatedAt,
      this.entryUpdatedBy
    );
  }
}

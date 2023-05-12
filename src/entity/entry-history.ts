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
    Pick<
      EntryHistory,
      "id" | "entryUuid" | "entryUpdatedAt" | "entryUpdatedBy"
    >
{
  @IsNumber()
  public id!: string;

  @IsString()
  public entryUuid!: string;

  @IsDate()
  public entryUpdatedAt!: Date;

  @IsUUID(4)
  public entryUpdatedBy!: string;

  public constructor(id: string, entryId: string, at: Date, by: string) {
    this.id = id;
    this.entryUuid = entryId;
    this.entryUpdatedAt = at;
    this.entryUpdatedBy = by;
  }
}

@Entity()
export class EntryHistory {
  @PrimaryGeneratedColumn("increment", { type: "int8" })
  public id!: string;

  @Column({ type: "int8", default: 0 })
  public parentId!: string;

  @ManyToOne(() => User)
  public user!: User;

  @Column({ type: "uuid" })
  public entryUuid!: string;

  @Column({
    type: "enum",
    enum: EntryOperation,
  })
  public entryOperation!: EntryOperation;

  @Column({ type: "timestamptz" })
  public entryUpdatedAt!: Date;

  @Column({ type: "uuid" })
  public entryUpdatedBy!: string;

  public toPlain(): PlainEntryHistory {
    return {
      id: this.id,
      parentId: this.parentId,
      entryUuid: this.entryUuid,
      entryOperation: this.entryOperation,
      entryUpdatedAt: this.entryUpdatedAt,
      entryUpdatedBy: this.entryUpdatedBy,
    };
  }

  public toCursor() {
    return new HistoryCursor(
      this.id,
      this.entryUuid,
      this.entryUpdatedAt,
      this.entryUpdatedBy
    );
  }
}

import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user";

export enum EntryOperation {
  CREATE_ENTRY = "CREATE_ENTRY",
  UPDATE_ENTRY = "UPDATE_ENTRY",
  REMOVE_ENTRY = "REMOVE_ENTRY",
}

export class HistoryCursor
  implements
    Pick<History, "id" | "entryId" | "entryUpdatedAt" | "entryUpdatedBy">
{
  id!: number;
  entryId!: string;
  entryUpdatedAt!: Date;
  entryUpdatedBy!: string;

  constructor(id: number, entryId: string, at: Date, by: string) {
    this.id = id;
    this.entryId = entryId;
    this.entryUpdatedAt = at;
    this.entryUpdatedBy = by;
  }
}

@Entity()
export class History {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Column({ default: 0 })
  lastId!: number;

  @ManyToOne(() => User)
  user!: User;

  @Column({
    type: "enum",
    enum: EntryOperation,
  })
  operation!: EntryOperation;

  @Column({ type: "uuid" })
  entryId!: string;

  @Column({ type: "timestamptz" })
  entryUpdatedAt!: Date;

  @Column({ type: "uuid" })
  entryUpdatedBy!: string;

  toCursor() {
    return new HistoryCursor(
      this.id,
      this.entryId,
      this.entryUpdatedAt,
      this.entryUpdatedBy
    );
  }
}

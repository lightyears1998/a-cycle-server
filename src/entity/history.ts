import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Entry } from "./entry";
import { User } from "./user";

export enum EntryOperation {
  CREATE_ENTRY,
  UPDATE_ENTRY,
  REMOVE_ENTRY,
}

@Entity()
export class History {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @ManyToOne(() => User)
  user!: User;

  @ManyToOne(() => Entry, { nullable: true })
  entry!: Entry;

  @Column({
    type: "enum",
    enum: EntryOperation,
  })
  operation!: EntryOperation;

  @Column()
  date!: Date;
}

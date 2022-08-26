import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EntryContent } from "./entry-content";

@Entity()
export class Entry {
  @PrimaryGeneratedColumn("uuid")
  uid!: string;

  @Column({ default: false })
  isRemoved!: boolean;

  @Column({ nullable: false })
  contentType!: string;

  @Column(() => EntryContent)
  content?: EntryContent;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

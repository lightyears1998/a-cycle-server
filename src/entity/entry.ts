import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { EntryContent } from "./entry-content";
import { User } from "./user";

@Entity()
export class Entry {
  @PrimaryGeneratedColumn("uuid")
  uid!: string;

  @ManyToOne(() => User, { nullable: false })
  owner?: User;

  @Column({ default: false })
  isRemoved!: boolean;

  @Column({ nullable: false })
  contentType!: string;

  @Column(() => EntryContent)
  content?: EntryContent;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: false })
  updatedAt!: Date;

  @Column({ nullable: false })
  updatedBy!: string;
}

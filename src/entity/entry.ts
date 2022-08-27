import moment from "moment";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
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
  type!: string;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column({ nullable: false })
  isTransient!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  startDate!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  endDate!: Date | null;

  @Column({ default: "{}" })
  metadata!: string;

  get timeSpan() {
    if (this.isTransient) {
      return 0;
    }

    if (this.endDate && this.startDate) {
      return moment(this.endDate).diff(this.startDate);
    }

    throw new Error("Can't calculate entry time span.");
  }

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: false })
  updatedAt!: Date;

  @Column({ nullable: false })
  updatedBy!: string;
}

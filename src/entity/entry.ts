import moment from "moment";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user";

export type PlainEntry = Omit<
  Entry,
  "owner" | "timeSpan" | "toPlainEntry" | "toMetadata"
>;

export type EntryMetadata = Pick<
  Entry,
  "uid" | "createdAt" | "updatedAt" | "updatedBy"
>;

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

  @Column({ type: "timestamptz", nullable: false, default: "NOW()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: false })
  updatedAt!: Date;

  @Column({ type: "uuid", nullable: false })
  updatedBy!: string;

  toPlainEntry(): PlainEntry {
    return {
      uid: this.uid,
      isRemoved: this.isRemoved,
      type: this.type,
      title: this.title,
      description: this.description,
      isTransient: this.isTransient,
      startDate: this.startDate,
      endDate: this.endDate,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }

  toMetadata(): EntryMetadata {
    return {
      uid: this.uid,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }
}

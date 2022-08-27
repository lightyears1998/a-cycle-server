import { Column } from "typeorm";
import moment from "moment";

export class EntryContent {
  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column({ nullable: false })
  isTransient!: boolean;

  @Column(() => Date)
  startDate!: Date;

  @Column(() => Date)
  endDate!: Date;

  @Column()
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
}

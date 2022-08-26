import { Column } from "typeorm";

export class EntryContent {
  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column(() => Date)
  startDate!: Date;

  @Column(() => Date)
  endDate!: Date;

  @Column()
  metadata!: string;
}

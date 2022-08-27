import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Metadata {
  @PrimaryColumn()
  key!: string;

  @Column()
  value!: string;
}

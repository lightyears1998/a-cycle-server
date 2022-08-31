import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class ServerStorage {
  @PrimaryColumn()
  key!: string;

  @Column()
  value!: string;
}

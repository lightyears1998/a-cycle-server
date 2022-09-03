import type { JsonValue } from "type-fest";
import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class ServerStorage {
  @PrimaryColumn()
  key!: string;

  @Column({ type: "jsonb" })
  value!: JsonValue;
}

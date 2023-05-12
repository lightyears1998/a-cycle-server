import type { JsonValue } from "type-fest";
import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class ServerStorage {
  @PrimaryColumn()
  public key!: string;

  @Column({ type: "jsonb" })
  public value!: JsonValue;
}

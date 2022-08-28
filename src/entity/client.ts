import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user";

@Entity()
export class Client {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Column({ type: "uuid" })
  uid!: string;

  @ManyToOne(() => User)
  user!: User;

  /**
   * JSON-format history cursor
   */
  @Column()
  historyCursor!: string;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity()
export class Backup {
  @PrimaryGeneratedColumn("uuid")
  public uuid!: string;

  @Column({ type: "text" })
  public content!: string;

  @CreateDateColumn()
  public createdAt!: Date;
}

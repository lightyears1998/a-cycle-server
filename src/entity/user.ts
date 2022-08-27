import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

@Entity()
@Unique("UNIQUE_USERNAME", ["username"])
export class User {
  @PrimaryGeneratedColumn("increment")
  id!: string;

  @Column({ default: false })
  isRemoved!: boolean;

  @Column()
  username!: string;

  @Column()
  passwordHash!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

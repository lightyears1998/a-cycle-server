import { Inject, Service } from "typedi";
import { EntityManager, IsNull } from "typeorm";
import { User } from "../entity/user";
import { BadParameterError } from "../error";

@Service()
export class UserService {
  @Inject()
  manager!: EntityManager;

  async getUserByUsername(username: string) {
    const user = await this.manager.findOne(User, {
      where: { username: username, removedAt: IsNull() },
    });
    return user;
  }

  checkPasswordStrength(password: string) {
    if (password.length < 8) {
      throw new BadParameterError(
        "Password should be longger than 8 characters."
      );
    }
  }
}

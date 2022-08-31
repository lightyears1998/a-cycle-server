import { Service } from "typedi";
import { IsNull } from "typeorm";
import { getManager } from "../db";
import { User } from "../entity/user";
import { BadParameterError } from "../error";

@Service()
export class UserService {
  async getUserByUsername(username: string) {
    const user = await getManager().findOne(User, {
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

import { Service } from "typedi";
import { getManager } from "../db";
import { User } from "../entity/user";
import { BadParameterError } from "../route/error";

@Service()
export class UserService {
  async getUserByUsername(username: string) {
    const user = await getManager().findOne(User, {
      where: { username: username },
    });
    return user;
  }

  async checkPassword(password: string) {
    if (password.length < 8) {
      throw new BadParameterError(
        "Password should be longger than 8 characters."
      );
    }
  }
}

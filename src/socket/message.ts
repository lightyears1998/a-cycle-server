export class AuthMessage {
  type = "auth";
  data = {
    success: true,
    why: "",
  };

  constructor(success: boolean, why: string) {
    this.data.success = success;
    this.data.why = why;
  }
}

export class WelcomeMessage {
  type = "welcome";
  data = {
    user: {
      id: "",
    },
  };

  constructor(userId: string) {
    this.data.user.id = userId;
  }
}

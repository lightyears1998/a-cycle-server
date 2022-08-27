export class BaseServerError extends Error {}

export class NotImplementError extends BaseServerError {}

export class BadParameterError extends BaseServerError {}
export class BadPasswordError extends BaseServerError {}

export class AdminTokenAuthenticationError extends BaseServerError {}

export class UserRegistrationProhibitedError extends BaseServerError {}
export class UserNotFoundError extends BaseServerError {}
export class UserAuthenticationError extends BaseServerError {}
export class UsernameAlreadyRegisteredError extends BaseServerError {}

export class EntryInvalidError extends BaseServerError {}

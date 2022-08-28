export class ServerError extends Error {}

export class NotImplementError extends ServerError {}

export class BadParameterError extends ServerError {}
export class BadPasswordError extends ServerError {}

export class AdminTokenAuthenticationError extends ServerError {}

export class UserRegistrationProhibitedError extends ServerError {}
export class UserNotFoundError extends ServerError {}
export class UserAuthenticationError extends ServerError {}
export class UsernameAlreadyRegisteredError extends ServerError {}

export class EntryInvalidError extends ServerError {}

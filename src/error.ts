export class ServerError extends Error {}

export class InternalServerError extends ServerError {}

export class NotImplementError extends ServerError {}

export class ClockOutOfSyncError extends ServerError {}

export class BadClientIdError extends ServerError {
  message = "`clientId` must be a valid uuid (v4) string.";
}
export class BadParameterError extends ServerError {}
export class BadPasswordError extends ServerError {}

export class AdminTokenAuthenticationError extends ServerError {}

export class UserRegistrationProhibitedError extends ServerError {}
export class UserNotFoundError extends ServerError {}
export class UserAuthenticationError extends ServerError {}
export class UsernameAlreadyRegisteredError extends ServerError {}

export class EntryInvalidError extends ServerError {}

export class HistoryCursorInvalidError extends ServerError {}
export class HistoryChainBrokenError extends ServerError {}

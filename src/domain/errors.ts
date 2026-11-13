/**
 * The app's error taxonomy. Every failure the user can see is one of these
 * kinds from one of these sources; errorCopy.ts turns each pair into words.
 */

export const APP_ERROR_KINDS = [
  /** The device has no connection. */
  'offline',
  /** The device is online but the request never got through. */
  'network',
  /** No answer within the time limit. */
  'timeout',
  /** The service refused because of its request quota. */
  'rate-limited',
  /** The service rejected our key. */
  'auth',
  /** The service has nothing for this request. */
  'not-found',
  /** The service answered with a server error. */
  'provider-down',
  /** The service answered with something we could not read. */
  'bad-response',
] as const;

export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

export const APP_ERROR_SOURCES = [
  /** Weather as a whole: every provider has failed. */
  'weather',
  'openweathermap',
  'open-meteo',
  'geodb',
  'push',
] as const;

export type AppErrorSource = (typeof APP_ERROR_SOURCES)[number];

type AppErrorOptions = {
  /** How long the service asked us to wait, when it said. */
  retryAfterMs?: number;
  /** Technical detail for the console. Never shown to the user. */
  detail?: string;
  cause?: unknown;
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly source: AppErrorSource;
  readonly retryAfterMs: number | undefined;

  constructor(kind: AppErrorKind, source: AppErrorSource, options: AppErrorOptions = {}) {
    super(`${source}: ${kind}${options.detail ? ` (${options.detail})` : ''}`, {
      cause: options.cause,
    });
    this.name = 'AppError';
    this.kind = kind;
    this.source = source;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

const RETRYABLE: ReadonlySet<AppErrorKind> = new Set(['network', 'timeout', 'provider-down']);

/**
 * Whether asking again straight away could plausibly succeed. A rejected key,
 * unreadable data, a quota refusal or a missing connection will not change in
 * the next second, so those are never retried automatically.
 */
export function isRetryable(kind: AppErrorKind): boolean {
  return RETRYABLE.has(kind);
}

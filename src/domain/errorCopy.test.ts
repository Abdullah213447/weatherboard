import { errorCopy } from './errorCopy';
import { APP_ERROR_KINDS, APP_ERROR_SOURCES } from './errors';

const everyError = APP_ERROR_SOURCES.flatMap((source) =>
  APP_ERROR_KINDS.map((kind) => ({ source, kind })),
);

/** Phrases that tell the user nothing. Any of these in a message is a bug. */
const VAGUE = [
  /something went wrong/i,
  /went wrong/i,
  /an error (has )?occurr?ed/i,
  /unknown error/i,
  /unexpected error/i,
  /oops/i,
  /uh[- ]oh/i,
  /error code/i,
  /please try again later\.?$/i,
  /\bfailed\.$/i,
];

/** Words that show the message says what the user can do. */
const GUIDANCE =
  /try again|reconnect|check|wait|pick|try a|turn the reminder|set the reminder|not something you did/i;

describe('errorCopy', () => {
  it('covers every kind from every source', () => {
    expect(everyError).toHaveLength(APP_ERROR_KINDS.length * APP_ERROR_SOURCES.length);
    for (const error of everyError) {
      const copy = errorCopy(error);
      expect(copy.title.length, JSON.stringify(error)).toBeGreaterThan(8);
      expect(copy.message.length, JSON.stringify(error)).toBeGreaterThan(30);
      expect(copy.action.label.length).toBeGreaterThan(0);
    }
  });

  it.each(everyError)('$source / $kind is specific, never generic', (error) => {
    const { title, message } = errorCopy(error);

    for (const phrase of VAGUE) {
      expect(title).not.toMatch(phrase);
      expect(message).not.toMatch(phrase);
    }
  });

  it.each(everyError)('$source / $kind tells the user what they can do', (error) => {
    expect(errorCopy(error).message).toMatch(GUIDANCE);
  });

  it.each(everyError)(
    '$source / $kind has a title that is not repeated as the message',
    (error) => {
      const { title, message } = errorCopy(error);

      expect(message).not.toContain(title);
      expect(title).not.toMatch(/[.!]$/);
    },
  );

  it('gives different sources different words for the same kind', () => {
    const titles = APP_ERROR_SOURCES.map((source) => errorCopy({ source, kind: 'timeout' }).title);

    expect(new Set(titles).size).toBe(APP_ERROR_SOURCES.length);
  });

  it('offers a retry only where retrying can help', () => {
    expect(errorCopy({ source: 'weather', kind: 'timeout' }).action.intent).toBe('retry');
    expect(errorCopy({ source: 'weather', kind: 'offline' }).action.intent).toBe('retry');
    expect(errorCopy({ source: 'geodb', kind: 'auth' }).action.intent).toBe('dismiss');
    expect(errorCopy({ source: 'geodb', kind: 'not-found' }).action.intent).toBe('dismiss');
  });

  it('tells the user how long to wait when the service said so', () => {
    const wait = (retryAfterMs?: number) =>
      errorCopy({ source: 'geodb', kind: 'rate-limited', retryAfterMs }).message;

    expect(wait(1000)).toContain('Wait 1 second,');
    expect(wait(30_000)).toContain('Wait 30 seconds,');
    expect(wait(120_000)).toContain('Wait 2 minutes,');
    expect(wait()).toContain('Wait about a minute,');
  });
});

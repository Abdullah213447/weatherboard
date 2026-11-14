import type { AppErrorKind, AppErrorSource } from './errors';

/**
 * The words shown for every failure. Each message says what failed and what
 * the person can do next. Nothing here is generic: errorCopy.test.ts rejects
 * vague phrases and checks that every kind and source is covered.
 */

export type ErrorAction = {
  label: string;
  /**
   * `retry`: run the same request again.
   * `dismiss`: nothing to retry; the message itself tells the user what to do.
   */
  intent: 'retry' | 'dismiss';
};

export type ErrorCopy = { title: string; message: string; action: ErrorAction };

type ErrorLike = { kind: AppErrorKind; source: AppErrorSource; retryAfterMs?: number | undefined };

/** How each source is named in a sentence, and what still works without it. */
const SUBJECT: Record<AppErrorSource, { name: string; capitalized: string; stillWorks: string }> = {
  weather: {
    name: 'the weather',
    capitalized: 'The weather',
    stillWorks: 'Your favourites and settings are unaffected.',
  },
  openweathermap: {
    name: 'OpenWeatherMap',
    capitalized: 'OpenWeatherMap',
    stillWorks: 'The app switches to its second weather source automatically.',
  },
  'open-meteo': {
    name: 'Open-Meteo',
    capitalized: 'Open-Meteo',
    stillWorks: 'The app uses its other weather source when it can.',
  },
  geodb: {
    name: 'city search',
    capitalized: 'City search',
    stillWorks: 'Your saved favourites still open without searching.',
  },
  push: {
    name: 'the reminder service',
    capitalized: 'The reminder service',
    stillWorks: 'Everything else in the app keeps working.',
  },
  'browser-push': {
    name: 'this browser’s notification service',
    capitalized: 'This browser’s notification service',
    stillWorks: 'Everything else in the app keeps working.',
  },
};

const RETRY: ErrorAction = { label: 'Try again', intent: 'retry' };
const OK: ErrorAction = { label: 'OK', intent: 'dismiss' };

function waitPhrase(retryAfterMs: number | undefined): string {
  if (retryAfterMs === undefined) return 'about a minute';
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) return `${String(seconds)} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
}

/** Wording that differs by source for one kind. Falls back to the template below. */
const OVERRIDES: Partial<Record<`${AppErrorSource}:${AppErrorKind}`, ErrorCopy>> = {
  'geodb:not-found': {
    title: 'No city matches that name',
    message: 'Check the spelling, or try the nearest larger city.',
    action: OK,
  },
  'weather:not-found': {
    title: 'No weather data for this place',
    message: 'Neither weather source covers these coordinates. Pick a nearby city instead.',
    action: OK,
  },
  'weather:provider-down': {
    title: 'Both weather sources are unavailable',
    message:
      'OpenWeatherMap and Open-Meteo both failed to answer. This is usually over within a few minutes, so try again shortly.',
    action: RETRY,
  },
  'weather:offline': {
    title: 'You are offline',
    message:
      'New weather cannot be loaded without a connection. Reconnect and try again; the last city you viewed stays available.',
    action: RETRY,
  },
  'push:auth': {
    title: 'Reminders could not be turned on',
    message:
      'The reminder service refused this browser’s subscription. Turn the reminder off and on again to create a fresh one.',
    action: OK,
  },
  // The browser refused or failed to create a subscription; nothing reached our server.
  'browser-push:provider-down': {
    title: 'This browser could not set up notifications',
    message:
      'The browser did not give WeatherBoard a notification subscription, so no reminder was saved. This happens in private windows and when the browser’s push service is switched off or blocked. Open WeatherBoard in a normal window and turn the reminder on again.',
    action: OK,
  },
  'push:not-found': {
    title: 'This reminder no longer exists',
    message: 'The browser’s notification subscription expired. Set the reminder again to renew it.',
    action: OK,
  },
};

export function errorCopy(error: ErrorLike): ErrorCopy {
  const override = OVERRIDES[`${error.source}:${error.kind}`];
  if (override) return override;

  const subject = SUBJECT[error.source];

  switch (error.kind) {
    case 'offline':
      return {
        title: 'You are offline',
        message: `${subject.capitalized} needs an internet connection. Reconnect and try again.`,
        action: RETRY,
      };
    case 'network':
      return {
        title: `Could not reach ${subject.name}`,
        message:
          'Your device is online, but the request was blocked or dropped on the way. Check any VPN, firewall or content blocker, then try again.',
        action: RETRY,
      };
    case 'timeout':
      return {
        title: `${subject.capitalized} took too long to answer`,
        message:
          'There was no reply within 8 seconds, which usually means a slow connection or a busy service. Try again in a moment.',
        action: RETRY,
      };
    case 'rate-limited':
      return {
        title: `Too many requests to ${subject.name}`,
        message: `The free service limits how often it can be asked. Wait ${waitPhrase(error.retryAfterMs)}, then try again. ${subject.stillWorks}`,
        action: RETRY,
      };
    case 'auth':
      return {
        title: `${subject.capitalized} rejected this app’s access key`,
        message: `This is a configuration problem on our side, not something you did. ${subject.stillWorks}`,
        action: OK,
      };
    case 'not-found':
      return {
        title: `${subject.capitalized} has nothing for this request`,
        message: 'Try a different city, or a larger one nearby.',
        action: OK,
      };
    case 'provider-down':
      return {
        title: `${subject.capitalized} is having problems`,
        message: `The service returned a server error. That is on their side and usually clears within minutes, so try again shortly. ${subject.stillWorks}`,
        action: RETRY,
      };
    case 'bad-response':
      return {
        title: `${subject.capitalized} sent data the app could not read`,
        message: `The reply was incomplete or in a format the app does not expect. Try again; if it keeps happening, the service has changed and the app needs an update. ${subject.stillWorks}`,
        action: RETRY,
      };
  }
}

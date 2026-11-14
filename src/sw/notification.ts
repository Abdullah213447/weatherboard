/**
 * Turns a push payload into what the service worker shows. Pure, so it is
 * tested without a service worker.
 */

export type NotificationSpec = {
  title: string;
  options: {
    body: string;
    icon: string;
    badge: string;
    /** A newer reminder replaces an older one still on screen, instead of stacking. */
    tag: string;
    /** Where a tap should lead. */
    data: { url: string };
  };
};

const ICON = '/icons/icon-192.png';
/** Monochrome: Android tints it and shows it in the status bar. */
const BADGE = '/icons/badge-96.png';
const DEFAULT_TAG = 'wb-daily';

/**
 * Shown when a push arrives that cannot be read. Something must always be
 * shown: a browser may revoke a subscription that receives a push and
 * displays nothing.
 */
export const FALLBACK: NotificationSpec = {
  title: 'WeatherBoard',
  options: {
    body: 'Your daily weather is ready. Tap to open.',
    icon: ICON,
    badge: BADGE,
    tag: DEFAULT_TAG,
    data: { url: '/' },
  },
};

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : null;

/** Only a path on this site is accepted as a destination; anything else opens the app's start page. */
function safeUrl(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/';
}

export function toNotification(payload: unknown): NotificationSpec {
  if (typeof payload !== 'object' || payload === null) return FALLBACK;
  const { title, body, url, tag } = payload as Record<string, unknown>;
  const safeTitle = text(title, 120);
  const safeBody = text(body, 300);
  if (!safeTitle || !safeBody) return FALLBACK;
  return {
    title: safeTitle,
    options: {
      body: safeBody,
      icon: ICON,
      badge: BADGE,
      tag: text(tag, 32) ?? DEFAULT_TAG,
      data: { url: safeUrl(url) },
    },
  };
}

/** Reads the payload of a push event, tolerating one that is missing or not JSON. */
export function readPayload(data: { json(): unknown } | null | undefined): unknown {
  try {
    return data?.json();
  } catch {
    return undefined;
  }
}

/** Where the app keeps the reminder's settings for the worker to read. */
export const REMINDER_CACHE = 'wb-reminder-v1';
export const REMINDER_SETTINGS_URL = '/__reminder/settings.json';

/** The parts of the worker's `clients` that a notification tap uses. */
export type WindowClients = {
  matchAll(options: { type: 'window'; includeUncontrolled: true }): Promise<
    readonly {
      url: string;
      focus(): Promise<unknown>;
      navigate(url: string): Promise<unknown>;
    }[]
  >;
  openWindow(url: string): Promise<unknown>;
};

/**
 * A tap on a notification: bring WeatherBoard forward on that city, reusing a
 * window that is already open rather than opening a second one. A window that
 * refuses to navigate is still focused; that is better than a duplicate.
 */
export async function openFromNotification(
  clients: WindowClients,
  origin: string,
  url: string,
): Promise<void> {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === origin);
  if (open) {
    await open.focus();
    await open.navigate(url).catch(() => undefined);
    return;
  }
  await clients.openWindow(url);
}

import { z } from 'zod';
import { AppError } from '@/domain/errors';
import { safeStorage } from '@/lib/safeStorage';
import { REMINDER_CACHE, REMINDER_SETTINGS_URL } from '@/sw/notification';
import { reminderApi, type PushSubscriptionData, type ReminderSettings } from './reminderApi';
import type { ReminderEnv } from './reminderController';

/** The real browser behind the reminder controller. */

const STORAGE_KEY = 'wb:reminder';

const settingsSchema = z.object({
  time: z.string(),
  timeZone: z.string(),
  city: z.object({ id: z.string(), name: z.string(), lat: z.number(), lon: z.number() }),
  unit: z.enum(['metric', 'imperial']),
});

const subscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** The VAPID public key as the bytes the browser expects. */
function applicationServerKey(): Uint8Array<ArrayBuffer> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new AppError('auth', 'push', { detail: 'VITE_VAPID_PUBLIC_KEY is not set' });
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function isIos(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS reports itself as a Mac; a Mac with a touch screen does not exist.
  return (
    /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  return (
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const WORKER_WAIT_MS = 5000;

/**
 * The service worker's registration. Someone who taps "Turn on" the moment
 * the page loads can be ahead of the worker, so this waits a few seconds for
 * it. Bounded, because where no worker is registered at all (development)
 * `serviceWorker.ready` never settles.
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(resolve, WORKER_WAIT_MS, null)),
  ]);
}

function toData(subscription: PushSubscription | null): PushSubscriptionData | null {
  const parsed = subscriptionSchema.safeParse(subscription?.toJSON());
  return parsed.success ? parsed.data : null;
}

export const browserReminderEnv: ReminderEnv = {
  support() {
    // On iOS, web push exists only inside an app added to the Home Screen.
    if (isIos() && !isInstalled()) return 'ios-install';
    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    return supported ? 'supported' : 'unsupported';
  },
  permission: () => Notification.permission,
  requestPermission: () => Notification.requestPermission(),

  async getSubscription() {
    const worker = await registration();
    return toData((await worker?.pushManager.getSubscription()) ?? null);
  },

  async subscribe() {
    const worker = await registration();
    if (!worker) {
      throw new AppError('not-found', 'push', { detail: 'no service worker is registered' });
    }
    const subscription = await worker.pushManager.subscribe({
      // Required by browsers: every push must show a notification.
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(),
    });
    const data = toData(subscription);
    if (!data) throw new AppError('bad-response', 'push', { detail: 'subscription has no keys' });
    return data;
  },

  async unsubscribe() {
    const worker = await registration();
    await (await worker?.pushManager.getSubscription())?.unsubscribe();
  },

  api: reminderApi,

  load() {
    try {
      const raw = safeStorage.get(STORAGE_KEY);
      const parsed = raw === null ? null : settingsSchema.safeParse(JSON.parse(raw));
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  store(settings: ReminderSettings | null) {
    if (settings) safeStorage.set(STORAGE_KEY, JSON.stringify(settings));
    else safeStorage.remove(STORAGE_KEY);
  },

  async shareWithWorker(settings) {
    try {
      if (typeof caches === 'undefined') return;
      const cache = await caches.open(REMINDER_CACHE);
      if (settings) {
        await cache.put(
          REMINDER_SETTINGS_URL,
          new Response(JSON.stringify(settings), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      } else {
        await cache.delete(REMINDER_SETTINGS_URL);
      }
    } catch {
      // Only used if the browser rotates the subscription; the reminder works without it.
    }
  },

  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

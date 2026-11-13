/// <reference lib="webworker" />
/**
 * WeatherBoard's service worker.
 *
 * It owns exactly one thing: the app shell. Weather and city-search responses
 * are never cached here. The last viewed city's weather is saved by the app
 * itself, as one normalized snapshot in Cache Storage (see lib/offlineStore),
 * which keeps a single source of truth for offline data.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {
  readPayload,
  REMINDER_CACHE,
  REMINDER_SETTINGS_URL,
  toNotification,
} from './sw/notification';

declare const self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

// The build replaces self.__WB_MANIFEST with the list of shell files and their
// revisions: HTML, JS, CSS, the Latin font files and the icons.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Any page navigation gets the cached index.html, so a link such as
// /?city=Lahore~Punjab~PK~31.4167~74.3333 opens with no connection.
// /api/* is left alone: those are server endpoints, not pages.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

// A new version waits until the user accepts it: taking over mid-session could
// mix old and new code. The page sends this message from its "Reload" button.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

// A reminder has arrived from the server. A notification is always shown, even
// if the payload cannot be read: some browsers revoke a subscription that
// receives a push and displays nothing.
self.addEventListener('push', (event) => {
  const { title, options } = toNotification(readPayload(event.data));
  event.waitUntil(self.registration.showNotification(title, options));
});

// A tap: close the notification, then bring WeatherBoard forward on that city,
// reusing a window that is already open rather than opening a second one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser has replaced the subscription (push services rotate them). Take
// the new one, or make one, and tell the server, using the settings the app
// left in Cache Storage. Without this the reminder would silently stop.
self.addEventListener('pushsubscriptionchange', (event) => {
  const change = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };
  change.waitUntil(
    (async () => {
      const stored = await (await caches.open(REMINDER_CACHE)).match(REMINDER_SETTINGS_URL);
      if (!stored) return;
      const settings = (await stored.json()) as Record<string, unknown>;
      const subscription =
        change.newSubscription ??
        (change.oldSubscription
          ? await self.registration.pushManager.subscribe(change.oldSubscription.options)
          : null);
      if (!subscription) return;
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          subscription: subscription.toJSON(),
          ...(change.oldSubscription && { replaces: change.oldSubscription.endpoint }),
        }),
      });
    })(),
  );
});

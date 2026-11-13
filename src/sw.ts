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
// Push notifications (handlers are added with the reminders feature)
// ---------------------------------------------------------------------------

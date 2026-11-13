export type Notice = 'update' | 'offline-ready' | 'install';

type Situation = {
  /** A new version is waiting. */
  updateReady: boolean;
  /** The shell has just been cached for the first time. */
  offlineReady: boolean;
  /** The browser can install the app and the user has not dismissed the offer. */
  installable: boolean;
  /** A city's weather has been shown at least once in this visit. */
  cityLoaded: boolean;
};

/**
 * Which of the app's own notices to show. One at a time, most important
 * first, so they never pile up: the update prompt, then "Ready to use
 * offline", then the install card. The install card also waits until the user
 * has seen a city's weather: asking someone to install an app before it has
 * shown them anything is asking too early.
 */
export function noticeToShow({
  updateReady,
  offlineReady,
  installable,
  cityLoaded,
}: Situation): Notice | null {
  if (updateReady) return 'update';
  if (offlineReady) return 'offline-ready';
  if (installable && cityLoaded) return 'install';
  return null;
}

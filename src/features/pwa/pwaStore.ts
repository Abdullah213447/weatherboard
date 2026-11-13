import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker's lifecycle as the app sees it: whether a new version is
 * waiting, and whether the shell has just been cached for the first time.
 * Nothing here takes over on its own. A waiting version is applied only when
 * the user asks.
 */

export type PwaState = {
  /** A new version has downloaded and is waiting to take over. */
  updateReady: boolean;
  /** The shell finished caching for the first time in this visit. */
  offlineReady: boolean;
};

let state: PwaState = { updateReady: false, offlineReady: false };
const listeners = new Set<() => void>();
let activate: ((reload?: boolean) => Promise<void>) | undefined;

function set(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export const pwa = {
  getState: (): PwaState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Registers the worker. Production builds only: in development it would cache stale code. */
  start: (): void => {
    if (!import.meta.env.PROD || activate) return;
    activate = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        set({ updateReady: true });
      },
      onOfflineReady: () => {
        set({ offlineReady: true });
      },
    });
  },
  /** Switches to the waiting version and reloads the page on it. */
  applyUpdate: (): void => {
    void activate?.(true);
  },
  dismissUpdate: (): void => {
    set({ updateReady: false });
  },
  dismissOfflineReady: (): void => {
    set({ offlineReady: false });
  },
  /** For tests and the UI preview: put the store in a given state. */
  simulate: (next: Partial<PwaState>): void => {
    set(next);
  },
};

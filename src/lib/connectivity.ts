/**
 * The app's one answer to "are we online?".
 *
 * The browser's own flag is only half reliable: `false` is true, but `true`
 * just means a network interface is up (a captive portal or dead Wi-Fi still
 * says online). So this combines the browser's online/offline events with
 * what real requests found: a request that could not get out marks the app
 * offline, and any request that succeeds marks it online again.
 */

type Listener = () => void;

export type Connectivity = {
  isOnline: () => boolean;
  /**
   * What the browser itself reports. When this is true but isOnline is false,
   * the app only believes it is offline because requests failed, so trying
   * again by hand is worth offering.
   */
  browserReportsOnline: () => boolean;
  subscribe: (listener: Listener) => () => void;
  /** A request got an answer from the network. */
  reportReachable: () => void;
  /** A request could not reach the network at all. */
  reportUnreachable: () => void;
};

export function createConnectivity(target: Window, browserOnline: () => boolean): Connectivity {
  /** Set when a request proved the network unreachable while the browser said otherwise. */
  let unreachable = false;
  const listeners = new Set<Listener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const set = (next: boolean) => {
    if (unreachable === next) return;
    unreachable = next;
    emit();
  };

  // The browser regaining a connection clears any earlier evidence.
  const onOnline = () => {
    unreachable = false;
    emit();
  };

  return {
    isOnline: () => browserOnline() && !unreachable,
    browserReportsOnline: browserOnline,
    subscribe(listener) {
      if (listeners.size === 0) {
        target.addEventListener('online', onOnline);
        target.addEventListener('offline', emit);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          target.removeEventListener('online', onOnline);
          target.removeEventListener('offline', emit);
        }
      };
    },
    reportReachable: () => {
      set(false);
    },
    reportUnreachable: () => {
      set(true);
    },
  };
}

export const connectivity = createConnectivity(window, () => navigator.onLine);

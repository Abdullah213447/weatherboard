/**
 * localStorage that never throws.
 *
 * Storage can be missing or blocked (private browsing, cookie settings, a full
 * quota). Every read and write is guarded, and a value that cannot be persisted
 * is held in memory so the app keeps working for the session.
 * `isPersistent` lets the UI tell the user that their choices will not last.
 */

type Listener = (value: string | null) => void;

export type SafeStorage = {
  /** False when values only live in memory and are lost when the tab closes. */
  readonly isPersistent: boolean;
  get(key: string): string | null;
  /** Returns true when the value reached persistent storage. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** Notifies when another tab changes `key`. Returns an unsubscribe function. */
  subscribe(key: string, listener: Listener): () => void;
};

const PROBE_KEY = '__wb_probe__';

function detect(getBackend: () => Storage): Storage | null {
  try {
    const backend = getBackend();
    backend.setItem(PROBE_KEY, '1');
    backend.removeItem(PROBE_KEY);
    return backend;
  } catch {
    return null;
  }
}

export function createSafeStorage(getBackend: () => Storage): SafeStorage {
  const backend = detect(getBackend);
  /** Values that could not be persisted: all of them without a backend, or single failed writes. */
  const memory = new Map<string, string>();

  return {
    isPersistent: backend !== null,

    get(key) {
      // A value held in memory means the last write for this key did not reach storage.
      const unsaved = memory.get(key);
      if (unsaved !== undefined || !backend) return unsaved ?? null;
      try {
        // Storage is the truth, including when it says "nothing": another tab may have cleared it.
        return backend.getItem(key);
      } catch {
        return null;
      }
    },

    set(key, value) {
      if (backend) {
        try {
          backend.setItem(key, value);
          memory.delete(key);
          return true;
        } catch {
          // Quota exceeded or storage revoked: keep it for this session.
        }
      }
      memory.set(key, value);
      return false;
    },

    remove(key) {
      memory.delete(key);
      try {
        backend?.removeItem(key);
      } catch {
        // Nothing to clean up if storage is unreachable.
      }
    },

    subscribe(key, listener) {
      if (typeof window === 'undefined') return () => undefined;
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener(event.newValue);
      };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export const safeStorage = createSafeStorage(() => window.localStorage);

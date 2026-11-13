/**
 * localStorage that never throws.
 *
 * Storage can be missing or blocked (private browsing, cookie settings, a full
 * quota). Every read and write is guarded, and values are mirrored in memory so
 * the app keeps working for the session when nothing can be persisted.
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
  const memory = new Map<string, string>();

  return {
    isPersistent: backend !== null,

    get(key) {
      try {
        const stored = backend?.getItem(key);
        if (stored !== null && stored !== undefined) return stored;
      } catch {
        // Fall through to the in-memory copy.
      }
      return memory.get(key) ?? null;
    },

    set(key, value) {
      memory.set(key, value);
      if (!backend) return false;
      try {
        backend.setItem(key, value);
        return true;
      } catch {
        return false;
      }
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

import { createSafeStorage } from './safeStorage';

function workingBackend(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('createSafeStorage', () => {
  it('persists and reads values when storage works', () => {
    const backend = workingBackend();
    const storage = createSafeStorage(() => backend);

    expect(storage.isPersistent).toBe(true);
    expect(storage.set('k', 'v')).toBe(true);
    expect(backend.getItem('k')).toBe('v');
    expect(storage.get('k')).toBe('v');

    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });

  it('falls back to memory when accessing storage throws', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(storage.isPersistent).toBe(false);
    expect(storage.set('k', 'v')).toBe(false);
    expect(storage.get('k')).toBe('v');
  });

  it('keeps the value for the session when the quota is exceeded', () => {
    const backend = workingBackend();
    const storage = createSafeStorage(() => backend);
    backend.setItem = () => {
      throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    };

    expect(storage.set('k', 'v')).toBe(false);
    expect(storage.get('k')).toBe('v');
  });

  it('trusts storage over memory once a value has been persisted', () => {
    const backend = workingBackend();
    const storage = createSafeStorage(() => backend);
    storage.set('k', 'v');

    // Cleared elsewhere, for example by another tab or by the user.
    backend.removeItem('k');

    expect(storage.get('k')).toBeNull();
  });

  it('notifies subscribers only for changes to their key from another tab', () => {
    const storage = createSafeStorage(workingBackend);
    const listener = vi.fn();
    const unsubscribe = storage.subscribe('k', listener);

    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'x' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', newValue: 'dark' }));
    expect(listener).toHaveBeenCalledExactlyOnceWith('dark');

    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', newValue: 'light' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

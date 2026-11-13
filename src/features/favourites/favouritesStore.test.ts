import { createSafeStorage, type SafeStorage } from '@/lib/safeStorage';
import { FIVE, honolulu, lahore, tokyo } from '@/test/favourites';
import { karachi } from '@/test/weather';
import { createFavouritesStore, FAVOURITES_KEY, MAX_FAVOURITES } from './favouritesStore';

function memoryBackend(initial?: string): Storage {
  const data = new Map<string, string>(initial === undefined ? [] : [[FAVOURITES_KEY, initial]]);
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

const stored = (cities: unknown, version: unknown = 1) => JSON.stringify({ version, cities });

function setup(initial?: string) {
  const backend = memoryBackend(initial);
  const storage: SafeStorage = createSafeStorage(() => backend);
  return { backend, store: createFavouritesStore(storage) };
}

const names = (store: ReturnType<typeof createFavouritesStore>) =>
  store.getState().cities.map((city) => city.name);

describe('adding and removing', () => {
  it('keeps cities in the order they were added and persists them', () => {
    const { store, backend } = setup();

    expect(store.add(karachi)).toEqual({ ok: true, count: 1 });
    expect(store.add(lahore)).toEqual({ ok: true, count: 2 });

    expect(names(store)).toEqual(['Karachi', 'Lahore']);
    expect(store.getState().saved).toBe(true);
    expect(backend.getItem(FAVOURITES_KEY)).toBe(stored([karachi, lahore]));
  });

  it('refuses a duplicate', () => {
    const { store } = setup();
    store.add(karachi);

    expect(store.add({ ...karachi })).toEqual({ ok: false, reason: 'duplicate' });
    expect(names(store)).toEqual(['Karachi']);
  });

  it('refuses a sixth city and leaves the five untouched', () => {
    const { store } = setup(stored(FIVE));

    expect(store.add(honolulu)).toEqual({ ok: false, reason: 'limit' });
    expect(store.getState().cities).toHaveLength(MAX_FAVOURITES);
    expect(names(store)).not.toContain('Honolulu');
  });

  it('removes by id and makes room for another', () => {
    const { store } = setup(stored(FIVE));

    store.remove(lahore.id);

    expect(names(store)).not.toContain('Lahore');
    expect(store.add(honolulu)).toEqual({ ok: true, count: 5 });
  });

  it('notifies subscribers on every change, and only on a change', () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    store.add(karachi);
    store.add(karachi);
    store.remove('no-such-id');
    store.remove(karachi.id);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('reading stored data', () => {
  it('restores a valid list', () => {
    expect(names(setup(stored([karachi, tokyo])).store)).toEqual(['Karachi', 'Tokyo']);
  });

  it.each([
    ['text that is not JSON', '{not json'],
    ['JSON of the wrong type', '"favourites"'],
    ['null', 'null'],
    ['a bare array from before versioning', JSON.stringify([karachi])],
    ['another version', stored([karachi], 2)],
    ['a missing version', JSON.stringify({ cities: [karachi] })],
    ['cities that is not a list', stored({ karachi })],
  ])('starts empty, without throwing, for %s', (_label, raw) => {
    const { store, backend } = setup(raw);

    expect(store.getState().cities).toEqual([]);
    // What could not be used is replaced by a clean, valid record.
    expect(backend.getItem(FAVOURITES_KEY)).toBe(stored([]));
  });

  it('drops malformed entries and keeps the valid ones', () => {
    const { store } = setup(
      stored([
        karachi,
        { name: 'No id or coordinates' },
        null,
        42,
        { ...lahore, coords: 'here' },
        tokyo,
      ]),
    );

    expect(names(store)).toEqual(['Karachi', 'Tokyo']);
  });

  it('removes duplicates, keeping the first', () => {
    const { store, backend } = setup(stored([karachi, lahore, karachi, lahore, tokyo]));

    expect(names(store)).toEqual(['Karachi', 'Lahore', 'Tokyo']);
    expect(backend.getItem(FAVOURITES_KEY)).toBe(stored([karachi, lahore, tokyo]));
  });

  it('keeps only the first five when more were stored', () => {
    const { store, backend } = setup(stored([...FIVE, honolulu]));

    expect(store.getState().cities).toHaveLength(5);
    expect(names(store)).not.toContain('Honolulu');
    expect(backend.getItem(FAVOURITES_KEY)).toBe(stored(FIVE));
  });

  it('does not rewrite storage that was already clean', () => {
    const backend = memoryBackend(stored([karachi]));
    const setItem = vi.spyOn(backend, 'setItem');
    createFavouritesStore(createSafeStorage(() => backend));

    // Only the storage wrapper's own availability probe.
    expect(setItem.mock.calls.filter(([key]) => key === FAVOURITES_KEY)).toHaveLength(0);
  });
});

describe('when storage is not available', () => {
  it('works in memory for the session when storage cannot be read at all', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const store = createFavouritesStore(storage);

    expect(store.getState()).toEqual({ cities: [], saved: false });
    expect(store.add(karachi)).toEqual({ ok: true, count: 1 });
    expect(names(store)).toEqual(['Karachi']);
    expect(store.getState().saved).toBe(false);
  });

  it('keeps the new favourite and reports it as unsaved when a write fails', () => {
    const { store, backend } = setup(stored([karachi]));
    backend.setItem = () => {
      throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    };

    expect(store.add(lahore)).toEqual({ ok: true, count: 2 });

    expect(names(store)).toEqual(['Karachi', 'Lahore']);
    expect(store.getState().saved).toBe(false);
  });

  it('reports saved again once a later write succeeds', () => {
    const { store, backend } = setup();
    const working = backend.setItem.bind(backend);
    backend.setItem = () => {
      throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    };
    store.add(karachi);
    expect(store.getState().saved).toBe(false);

    backend.setItem = working;
    store.add(lahore);

    expect(store.getState().saved).toBe(true);
    expect(backend.getItem(FAVOURITES_KEY)).toBe(stored([karachi, lahore]));
  });
});

describe('another tab', () => {
  it('adopts a change made elsewhere, cleaned the same way', () => {
    const { store } = setup(stored([karachi]));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FAVOURITES_KEY,
        newValue: stored([karachi, tokyo, tokyo]),
      }),
    );

    expect(names(store)).toEqual(['Karachi', 'Tokyo']);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('empties the list when the other tab cleared it, and ignores other keys', () => {
    const { store } = setup(stored([karachi]));
    const unsubscribe = store.subscribe(() => undefined);

    window.dispatchEvent(new StorageEvent('storage', { key: 'wb:theme', newValue: 'dark' }));
    expect(names(store)).toEqual(['Karachi']);

    window.dispatchEvent(new StorageEvent('storage', { key: FAVOURITES_KEY, newValue: null }));
    expect(store.getState().cities).toEqual([]);
    unsubscribe();
  });
});

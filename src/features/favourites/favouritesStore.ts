import { useSyncExternalStore } from 'react';
import type { City } from '@/domain/weather';
import { parseCity } from '@/lib/citySchema';
import { safeStorage, type SafeStorage } from '@/lib/safeStorage';

export const MAX_FAVOURITES = 5;
export const FAVOURITES_KEY = 'wb:favourites';
/** Bump when the stored shape changes. Data from another version is discarded, not guessed at. */
const VERSION = 1;

export type FavouritesState = {
  /** In the order they were added. */
  cities: readonly City[];
  /**
   * False when the list only lives in memory: storage is unavailable, or the
   * last write failed. Favourites still work; they will not survive the tab.
   */
  saved: boolean;
};

export type AddResult = { ok: true; count: number } | { ok: false; reason: 'limit' | 'duplicate' };

export type FavouritesStore = {
  getState: () => FavouritesState;
  subscribe: (listener: () => void) => () => void;
  add: (city: City) => AddResult;
  remove: (cityId: string) => void;
  /** Reads storage again. For tests, and for recovering after storage was changed underneath. */
  reload: () => void;
};

/**
 * Whatever is in storage, turned into a valid list: at most five distinct
 * cities. Anything unreadable, from another version or malformed is dropped.
 */
function clean(raw: string | null): City[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null) return [];
  const { version, cities } = data as { version?: unknown; cities?: unknown };
  if (version !== VERSION || !Array.isArray(cities)) return [];

  const seen = new Set<string>();
  const result: City[] = [];
  for (const entry of cities) {
    const city = parseCity(entry);
    if (!city || seen.has(city.id)) continue;
    seen.add(city.id);
    result.push(city);
    if (result.length === MAX_FAVOURITES) break;
  }
  return result;
}

const serialise = (cities: readonly City[]) => JSON.stringify({ version: VERSION, cities });

export function createFavouritesStore(storage: SafeStorage): FavouritesStore {
  const listeners = new Set<() => void>();
  let state: FavouritesState = { cities: [], saved: storage.isPersistent };

  const set = (cities: readonly City[], saved: boolean) => {
    state = { cities, saved };
    for (const listener of listeners) listener();
  };

  const persist = (cities: readonly City[]) => {
    set(cities, storage.set(FAVOURITES_KEY, serialise(cities)));
  };

  // Read once at start. If what was stored needed cleaning, store the clean copy.
  const stored = storage.get(FAVOURITES_KEY);
  const initial = clean(stored);
  if (stored !== null && stored !== serialise(initial)) persist(initial);
  else state = { cities: initial, saved: storage.isPersistent };

  let unsubscribeStorage: (() => void) | undefined;

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      // Another tab changed the list: adopt it.
      unsubscribeStorage ??= storage.subscribe(FAVOURITES_KEY, (value) => {
        set(clean(value), storage.isPersistent);
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeStorage?.();
          unsubscribeStorage = undefined;
        }
      };
    },

    add(city) {
      if (state.cities.some((entry) => entry.id === city.id)) {
        return { ok: false, reason: 'duplicate' };
      }
      if (state.cities.length >= MAX_FAVOURITES) return { ok: false, reason: 'limit' };
      persist([...state.cities, city]);
      return { ok: true, count: state.cities.length };
    },

    remove(cityId) {
      if (!state.cities.some((entry) => entry.id === cityId)) return;
      persist(state.cities.filter((entry) => entry.id !== cityId));
    },

    reload() {
      set(clean(storage.get(FAVOURITES_KEY)), storage.isPersistent);
    },
  };
}

export const favouritesStore = createFavouritesStore(safeStorage);

export function useFavourites(store: FavouritesStore = favouritesStore): FavouritesState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

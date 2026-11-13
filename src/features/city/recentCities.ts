import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { City } from '@/domain/weather';
import { safeStorage } from '@/lib/safeStorage';

/**
 * Cities the user has opened, most recent first. Search offers them the
 * instant a matching prefix is typed, before any request has come back.
 */

const KEY = 'wb:recent-cities';
const MAX_RECENT = 8;

const schema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    region: z.string().optional(),
    country: z.string(),
    countryCode: z.string(),
    coords: z.object({ lat: z.number(), lon: z.number() }),
  }),
);

function read(): City[] {
  try {
    const raw = safeStorage.get(KEY);
    if (raw === null) return [];
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.map(({ region, ...rest }) => ({
      ...rest,
      ...(region !== undefined && { region }),
    }));
  } catch {
    return [];
  }
}

let recent: City[] | null = null;
const listeners = new Set<() => void>();

function current(): City[] {
  recent ??= read();
  return recent;
}

export function addRecentCity(city: City): void {
  recent = [city, ...current().filter((entry) => entry.id !== city.id)].slice(0, MAX_RECENT);
  safeStorage.set(KEY, JSON.stringify(recent));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: forget the in-memory copy so storage is read afresh. */
export function resetRecentCitiesForTests(): void {
  recent = null;
}

export function useRecentCities(): City[] {
  return useSyncExternalStore(subscribe, current);
}

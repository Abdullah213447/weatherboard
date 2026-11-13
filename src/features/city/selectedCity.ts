import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { decodeCityParam, encodeCityParam } from '@/domain/cities';
import type { City } from '@/domain/weather';
import { safeStorage } from '@/lib/safeStorage';

/**
 * The city on screen. Two things must survive a reload: the link (so a URL
 * can be shared or bookmarked) and the last city viewed (so the app opens on
 * it, including offline). The URL wins when both are present.
 */

const PARAM = 'city';
const LAST_CITY_KEY = 'wb:last-city';

const storedCity = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string().optional(),
  country: z.string(),
  countryCode: z.string(),
  coords: z.object({ lat: z.number(), lon: z.number() }),
});

function readStored(): City | null {
  try {
    const raw = safeStorage.get(LAST_CITY_KEY);
    if (raw === null) return null;
    const parsed = storedCity.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { region, ...rest } = parsed.data;
    return { ...rest, ...(region !== undefined && { region }) };
  } catch {
    return null;
  }
}

function readUrl(): City | null {
  const fromUrl = decodeCityParam(new URLSearchParams(window.location.search).get(PARAM));
  if (!fromUrl) return null;
  // The stored copy of the same city carries the provider's full country name.
  const stored = readStored();
  return stored?.id === fromUrl.id ? stored : fromUrl;
}

function urlFor(city: City | null): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  const others = url.searchParams.toString();
  // Written by hand: URLSearchParams would turn each "~" into "%7E" and make
  // the address unreadable. encodeURIComponent leaves "~" alone.
  const own = city ? `${PARAM}=${encodeURIComponent(encodeCityParam(city))}` : '';
  const query = [others, own].filter(Boolean).join('&');
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

let current: City | null = null;
let initialised = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function initialise(): void {
  if (initialised) return;
  initialised = true;
  current = readUrl() ?? readStored();
  // Opening the app with no link restores the last city: make the address say so.
  if (current) window.history.replaceState(null, '', urlFor(current));
}

function onPopState(): void {
  current = readUrl();
  emit();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('popstate', onPopState);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', onPopState);
  };
}

export function selectCity(city: City): void {
  initialise();
  if (current?.id !== city.id) window.history.pushState(null, '', urlFor(city));
  current = city;
  safeStorage.set(LAST_CITY_KEY, JSON.stringify(city));
  emit();
}

export function getSelectedCity(): City | null {
  initialise();
  return current;
}

/** For tests: forget everything and read the URL and storage afresh next time. */
export function resetSelectedCityForTests(): void {
  current = null;
  initialised = false;
}

export function useSelectedCity(): City | null {
  return useSyncExternalStore(subscribe, getSelectedCity);
}

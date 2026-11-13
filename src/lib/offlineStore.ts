import { z } from 'zod';
import { CONDITION_KINDS, type WeatherSnapshot } from '@/domain/weather';

/**
 * The last weather the user looked at, kept in Cache Storage so it survives
 * with no connection. One normalized snapshot, not raw provider responses:
 * the offline view then has a single source of truth, and no cache entry is
 * keyed by a URL that contains an API key.
 */

const CACHE_NAME = 'wb-last-weather-v1';
/** A synthetic address: nothing is ever fetched from it over the network. */
const ENTRY_URL = '/__offline/last-weather.json';

const condition = z.object({ kind: z.enum(CONDITION_KINDS), isDay: z.boolean() });

// What comes back out of the cache is validated like any other outside data:
// it may have been written by an older version of the app.
const snapshotSchema = z.object({
  city: z.object({
    id: z.string(),
    name: z.string(),
    region: z.string().optional(),
    country: z.string(),
    countryCode: z.string(),
    coords: z.object({ lat: z.number(), lon: z.number() }),
  }),
  current: z.object({
    observedAt: z.number(),
    temperatureC: z.number(),
    feelsLikeC: z.number(),
    humidityPct: z.number(),
    windSpeedMs: z.number(),
    windDirectionDeg: z.number().optional(),
    condition,
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      minC: z.number(),
      maxC: z.number(),
      condition,
      precipitationChancePct: z.number().optional(),
      partial: z.boolean(),
    }),
  ),
  sun: z.object({ sunriseAt: z.number(), sunsetAt: z.number() }).optional(),
  utcOffsetSeconds: z.number(),
  provider: z.enum(['openweathermap', 'open-meteo']),
  fetchedAt: z.number(),
});

export type OfflineStore = {
  /** Replaces the stored snapshot. Never throws: offline support is best effort. */
  write(snapshot: WeatherSnapshot): Promise<void>;
  /** The stored snapshot, or null if there is none or it cannot be read. */
  read(): Promise<WeatherSnapshot | null>;
};

export function createOfflineStore(getCaches: () => CacheStorage | undefined): OfflineStore {
  return {
    async write(snapshot) {
      try {
        const cache = await getCaches()?.open(CACHE_NAME);
        await cache?.put(
          ENTRY_URL,
          new Response(JSON.stringify(snapshot), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      } catch {
        // Storage is full or blocked. The live view is unaffected.
      }
    },

    async read() {
      try {
        const cache = await getCaches()?.open(CACHE_NAME);
        const response = await cache?.match(ENTRY_URL);
        if (!response) return null;
        const parsed = snapshotSchema.safeParse(await response.json());
        if (!parsed.success) return null;
        // Zod marks optional keys as `T | undefined`; the domain type omits them instead.
        return JSON.parse(JSON.stringify(parsed.data)) as WeatherSnapshot;
      } catch {
        return null;
      }
    },
  };
}

export const offlineStore = createOfflineStore(() =>
  typeof caches === 'undefined' ? undefined : caches,
);

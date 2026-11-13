import { z } from 'zod';
import { conditionFromWmo } from '../../src/domain/conditions.js';
import type { ReminderForecast } from '../../src/domain/reminderText.js';

const body = z.object({
  current: z.object({ temperature_2m: z.number() }).optional(),
  daily: z.object({
    weather_code: z.array(z.number()).min(1),
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

export type FetchForecast = (city: { lat: number; lon: number }) => Promise<ReminderForecast>;

/**
 * Today's forecast for a reminder, from Open-Meteo (no key, so nothing secret
 * is needed to send a useful notification). Throws on any failure; the caller
 * then sends a plain reminder instead.
 */
export function createForecastFetcher(fetchImpl: typeof fetch, timeoutMs = 6000): FetchForecast {
  return async ({ lat, lon }) => {
    const query = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '1',
    }).toString();
    const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${query}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Open-Meteo answered ${String(response.status)}`);
    const { current, daily } = body.parse(await response.json());

    const chance = daily.precipitation_probability_max?.[0];
    return {
      ...(current && { currentC: current.temperature_2m }),
      // The schema guarantees one entry in each array.
      maxC: daily.temperature_2m_max[0] ?? 0,
      minC: daily.temperature_2m_min[0] ?? 0,
      ...(chance !== undefined && chance !== null && { chancePct: chance }),
      kind: conditionFromWmo(daily.weather_code[0] ?? -1),
    };
  };
}

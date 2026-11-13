import { conditionFromOwm } from '@/domain/conditions';
import { AppError } from '@/domain/errors';
import { aggregateDaily, type ForecastSlot } from '@/domain/forecast';
import type { FetchJson } from '../http';
import type { ProviderWeather, WeatherProvider } from './provider';
import {
  owmCurrentSchema,
  owmForecastSchema,
  parseBody,
  type OwmCurrent,
  type OwmForecast,
} from './schemas';

const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const SOURCE = 'openweathermap';
export const FORECAST_DAYS = 5;

/**
 * Pure mapping from the two OpenWeatherMap bodies to the normalized model.
 * The free plan has no daily endpoint, so days are built from 3-hour slots.
 */
export function mapOpenWeatherMap(
  current: OwmCurrent,
  forecast: OwmForecast,
  now: number,
): ProviderWeather {
  // The schema guarantees at least one entry; the first is the primary condition.
  const [primary] = current.weather;
  if (!primary) throw new AppError('bad-response', SOURCE, { detail: 'weather is empty' });

  const currentWeather = {
    observedAt: current.dt * 1000,
    temperatureC: current.main.temp,
    feelsLikeC: current.main.feels_like,
    humidityPct: current.main.humidity,
    windSpeedMs: current.wind.speed,
    ...(current.wind.deg !== undefined && { windDirectionDeg: current.wind.deg }),
    // Icons end in "d" or "n": OpenWeatherMap's own day/night flag for this place and time.
    condition: { kind: conditionFromOwm(primary.id), isDay: primary.icon.endsWith('d') },
  };

  const slots: ForecastSlot[] = forecast.list.flatMap((entry) => {
    const [condition] = entry.weather;
    if (!condition) return [];
    return [
      {
        time: entry.dt * 1000,
        temperatureC: entry.main.temp,
        condition: { kind: conditionFromOwm(condition.id), isDay: entry.sys.pod === 'd' },
        ...(entry.pop !== undefined && { precipitationChancePct: Math.round(entry.pop * 100) }),
      },
    ];
  });

  const daily = aggregateDaily({
    slots,
    now,
    utcOffsetSeconds: current.timezone,
    current: currentWeather,
    days: FORECAST_DAYS,
  });
  if (daily.length !== FORECAST_DAYS) {
    throw new AppError('bad-response', SOURCE, {
      detail: `forecast covers ${String(daily.length)} days, expected ${String(FORECAST_DAYS)}`,
    });
  }

  return {
    current: currentWeather,
    daily,
    utcOffsetSeconds: current.timezone,
    provider: SOURCE,
    fetchedAt: now,
  };
}

type Deps = { apiKey: string | undefined; fetchJson: FetchJson; now: () => number };

export function createOpenWeatherMapProvider({ apiKey, fetchJson, now }: Deps): WeatherProvider {
  return {
    id: SOURCE,
    async fetch(coords, signal) {
      if (!apiKey) {
        throw new AppError('auth', SOURCE, { detail: 'VITE_OPENWEATHER_API_KEY is not set' });
      }
      const query = new URLSearchParams({
        lat: String(coords.lat),
        lon: String(coords.lon),
        units: 'metric', // Celsius and metres per second
        appid: apiKey,
      }).toString();
      const options = { source: SOURCE, ...(signal && { signal }) } as const;

      const [currentBody, forecastBody] = await Promise.all([
        fetchJson(`${BASE_URL}/weather?${query}`, options),
        fetchJson(`${BASE_URL}/forecast?${query}`, options),
      ]);

      return mapOpenWeatherMap(
        parseBody(owmCurrentSchema, currentBody, SOURCE),
        parseBody(owmForecastSchema, forecastBody, SOURCE),
        now(),
      );
    },
  };
}

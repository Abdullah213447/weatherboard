import { conditionFromWmo } from '@/domain/conditions';
import { AppError } from '@/domain/errors';
import type { DailyForecast } from '@/domain/weather';
import type { FetchJson } from '../http';
import { FORECAST_DAYS } from './openWeatherMap';
import type { ProviderWeather, WeatherProvider } from './provider';
import { openMeteoSchema, parseBody, type OpenMeteoForecast } from './schemas';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const SOURCE = 'open-meteo';

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'is_day',
].join(',');

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
].join(',');

/** Pure mapping from an Open-Meteo body to the normalized model. */
export function mapOpenMeteo(body: OpenMeteoForecast, now: number): ProviderWeather {
  const { current, daily, utc_offset_seconds: utcOffsetSeconds } = body;

  const days: DailyForecast[] = [];
  for (let index = 0; index < FORECAST_DAYS; index += 1) {
    const time = daily.time[index];
    const code = daily.weather_code[index];
    const maxC = daily.temperature_2m_max[index];
    const minC = daily.temperature_2m_min[index];
    if (time === undefined || code === undefined || maxC === undefined || minC === undefined) {
      throw new AppError('bad-response', SOURCE, {
        detail: `daily arrays hold fewer than ${String(FORECAST_DAYS)} days`,
      });
    }
    const chance = daily.precipitation_probability_max?.[index];
    days.push({
      // `time` is local midnight as an instant; shifting by the offset reads back the local date.
      date: new Date((time + utcOffsetSeconds) * 1000).toISOString().slice(0, 10),
      minC,
      maxC,
      condition: { kind: conditionFromWmo(code), isDay: true },
      ...(chance !== undefined && chance !== null && { precipitationChancePct: chance }),
      // Open-Meteo aggregates the whole local day itself, today included.
      partial: false,
    });
  }

  return {
    current: {
      observedAt: current.time * 1000,
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidityPct: current.relative_humidity_2m,
      windSpeedMs: current.wind_speed_10m,
      ...(current.wind_direction_10m !== undefined && {
        windDirectionDeg: current.wind_direction_10m,
      }),
      condition: { kind: conditionFromWmo(current.weather_code), isDay: current.is_day === 1 },
    },
    daily: days,
    utcOffsetSeconds,
    provider: SOURCE,
    fetchedAt: now,
  };
}

type Deps = { fetchJson: FetchJson; now: () => number };

export function createOpenMeteoProvider({ fetchJson, now }: Deps): WeatherProvider {
  return {
    id: SOURCE,
    async fetch(coords, signal) {
      const query = new URLSearchParams({
        latitude: String(coords.lat),
        longitude: String(coords.lon),
        current: CURRENT_FIELDS,
        daily: DAILY_FIELDS,
        timezone: 'auto', // days and offset follow the city, not the viewer
        forecast_days: String(FORECAST_DAYS),
        wind_speed_unit: 'ms',
        timeformat: 'unixtime',
      }).toString();

      const body = await fetchJson(`${BASE_URL}?${query}`, {
        source: SOURCE,
        ...(signal && { signal }),
      });
      return mapOpenMeteo(parseBody(openMeteoSchema, body, SOURCE), now());
    },
  };
}

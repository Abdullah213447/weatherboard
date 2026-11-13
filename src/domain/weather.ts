/**
 * The normalized weather model. Nothing here knows which provider the data
 * came from; the mappers in src/api translate each provider into these types.
 * SI units throughout: display units are a view concern.
 */

export type Coordinates = { lat: number; lon: number };

export type City = {
  /** Stable key for favourites and caches, for example "geodb:1234". */
  id: string;
  name: string;
  region?: string;
  country: string;
  countryCode: string;
  /** Weather is always fetched by coordinates, never by name. */
  coords: Coordinates;
};

export const CONDITION_KINDS = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'freezing-rain',
  'snow',
  'thunderstorm',
  'unknown',
] as const;

export type ConditionKind = (typeof CONDITION_KINDS)[number];

/** Labels, icons and the sky tint all derive from this pair. */
export type Condition = { kind: ConditionKind; isDay: boolean };

export type CurrentWeather = {
  /** Epoch milliseconds. */
  observedAt: number;
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windSpeedMs: number;
  windDirectionDeg?: number;
  condition: Condition;
};

export type DailyForecast = {
  /** YYYY-MM-DD in the city's local time. */
  date: string;
  minC: number;
  maxC: number;
  condition: Condition;
  precipitationChancePct?: number;
  /** True when built from an incomplete day of readings. */
  partial: boolean;
};

export type ProviderId = 'openweathermap' | 'open-meteo';

export type WeatherSnapshot = {
  city: City;
  current: CurrentWeather;
  /** Exactly five days, today first. */
  daily: DailyForecast[];
  utcOffsetSeconds: number;
  provider: ProviderId;
  /** Epoch milliseconds. */
  fetchedAt: number;
};

export type SkyTintKey = `${ConditionKind}-${'day' | 'night'}`;

export function skyTintKey(condition: Condition): SkyTintKey {
  return `${condition.kind}-${condition.isDay ? 'day' : 'night'}`;
}

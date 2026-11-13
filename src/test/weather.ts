import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import owmCurrentKarachi from '@fixtures/openweathermap/current-karachi.json';
import owmForecastKarachi from '@fixtures/openweathermap/forecast-karachi.json';
import { mapOpenMeteo } from '@/api/weather/openMeteo';
import { mapOpenWeatherMap } from '@/api/weather/openWeatherMap';
import {
  openMeteoSchema,
  owmCurrentSchema,
  owmForecastSchema,
  parseBody,
} from '@/api/weather/schemas';
import type { City, WeatherSnapshot } from '@/domain/weather';

export const karachi: City = {
  id: 'PK:24.86,67.00',
  name: 'Karachi',
  region: 'Sindh',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 24.8607, lon: 67.0011 },
};

/** The moment the OpenWeatherMap fixture was observed: 01:38 on 14 Nov 2026 in Karachi. */
export const RECORDED_AT = owmCurrentKarachi.dt * 1000;

/** Karachi as OpenWeatherMap reported it, mapped by the real adapter. */
export const karachiSnapshot: WeatherSnapshot = {
  city: karachi,
  ...mapOpenWeatherMap(
    parseBody(owmCurrentSchema, owmCurrentKarachi, 'openweathermap'),
    parseBody(owmForecastSchema, owmForecastKarachi, 'openweathermap'),
    RECORDED_AT,
  ),
};

/** Karachi as the backup provider reported it. */
export const karachiBackupSnapshot: WeatherSnapshot = {
  city: karachi,
  ...mapOpenMeteo(parseBody(openMeteoSchema, openMeteoKarachi, 'open-meteo'), RECORDED_AT),
};

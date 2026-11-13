import type { City, WeatherSnapshot } from '@/domain/weather';
import { karachi, karachiSnapshot } from './weather';

function city(
  name: string,
  region: string,
  country: string,
  code: string,
  lat: number,
  lon: number,
): City {
  return {
    id: `${code}:${lat.toFixed(2)},${lon.toFixed(2)}`,
    name,
    region,
    country,
    countryCode: code,
    coords: { lat, lon },
  };
}

export const lahore = city('Lahore', 'Punjab', 'Pakistan', 'PK', 31.4167, 74.3333);
export const tokyo = city('Tokyo', 'Tokyo', 'Japan', 'JP', 35.6762, 139.6503);
export const london = city('London', 'England', 'United Kingdom', 'GB', 51.5072, -0.1275);
export const honolulu = city('Honolulu', 'Hawaii', 'United States', 'US', 21.3069, -157.8583);
export const longName = city('Thiruvananthapuram', 'Kerala', 'India', 'IN', 8.5241, 76.9366);

/** Five cities: a full list. */
export const FIVE: City[] = [karachi, lahore, tokyo, london, longName];

/** Real recorded weather, relabelled for another city. Only the city differs. */
export const snapshotFor = (target: City): WeatherSnapshot => ({
  ...karachiSnapshot,
  city: target,
});

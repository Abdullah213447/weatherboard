import { createGeoDbSource } from '@/api/geodb';
import { fetchJson } from '@/api/http';
import { createOpenMeteoGeocodingSource } from '@/api/openMeteoGeocoding';
import { createCitySearcher } from './citySearcher';

/** The app's city search: GeoDB first, Open-Meteo's geocoder as the backup. */
export const citySearcher = createCitySearcher({
  primary: createGeoDbSource({ apiKey: import.meta.env.VITE_RAPIDAPI_KEY, fetchJson }),
  fallback: createOpenMeteoGeocodingSource({ fetchJson }),
  now: () => Date.now(),
});

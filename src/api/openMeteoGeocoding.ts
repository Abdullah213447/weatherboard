import { z } from 'zod';
import { cityId } from '@/domain/cities';
import type { CitySource } from './geodb';
import type { FetchJson } from './http';
import { parseBody } from './weather/schemas';

const URL_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const SOURCE = 'open-meteo';

const schema = z.object({
  // The key is absent, not empty, when nothing matches.
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Open-Meteo's geocoder: the backup for city search when GeoDB is rate
 * limited or down. No key. Its matching is fuzzier than a prefix search, so
 * its results are never used to answer longer prefixes locally.
 */
export function createOpenMeteoGeocodingSource({
  fetchJson,
}: {
  fetchJson: FetchJson;
}): CitySource {
  return async (query, signal) => {
    const params = new URLSearchParams({
      name: query,
      count: '10',
      language: 'en',
      format: 'json',
    }).toString();
    const body = await fetchJson(`${URL_BASE}?${params}`, {
      source: SOURCE,
      ...(signal && { signal }),
    });
    const { results = [] } = parseBody(schema, body, SOURCE);

    return {
      candidates: results.flatMap((place) => {
        // A place with no country cannot be told apart from its namesakes, so it is left out.
        if (!place.country || !place.country_code) return [];
        const coords = { lat: place.latitude, lon: place.longitude };
        return [
          {
            placeKind: 'city' as const,
            city: {
              id: cityId(place.country_code, coords),
              name: place.name,
              ...(place.admin1 && { region: place.admin1 }),
              country: place.country,
              countryCode: place.country_code,
              coords,
            },
          },
        ];
      }),
      complete: false,
    };
  };
}

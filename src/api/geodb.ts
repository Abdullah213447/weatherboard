import { z } from 'zod';
import { cityId, type CityCandidate } from '@/domain/cities';
import { AppError } from '@/domain/errors';
import type { FetchJson } from './http';
import { parseBody } from './weather/schemas';

const HOST = 'wft-geo-db.p.rapidapi.com';
const SOURCE = 'geodb';
/** The free plan's maximum page size. Asked for in full so duplicates can be cleaned out. */
const PAGE_SIZE = 10;

const schema = z.object({
  data: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      country: z.string(),
      countryCode: z.string(),
      region: z.string().nullish(),
      latitude: z.number(),
      longitude: z.number(),
    }),
  ),
  metadata: z.object({ totalCount: z.number() }),
});

export type CitySearchPage = {
  candidates: CityCandidate[];
  /** True when the page holds every match, so longer prefixes can be filtered locally. */
  complete: boolean;
};

export type CitySource = (query: string, signal?: AbortSignal) => Promise<CitySearchPage>;

type Deps = { apiKey: string | undefined; fetchJson: FetchJson };

/**
 * GeoDB Cities via RapidAPI: places whose name has a word starting with the
 * query, largest first. No type filter: GeoDB files some major cities
 * (Lahore, for one) only as administrative areas.
 */
export function createGeoDbSource({ apiKey, fetchJson }: Deps): CitySource {
  return async (query, signal) => {
    if (!apiKey) throw new AppError('auth', SOURCE, { detail: 'VITE_RAPIDAPI_KEY is not set' });

    const params = new URLSearchParams({
      namePrefix: query,
      limit: String(PAGE_SIZE),
      sort: '-population',
      languageCode: 'en',
    }).toString();
    const body = await fetchJson(`https://${HOST}/v1/geo/cities?${params}`, {
      source: SOURCE,
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
      ...(signal && { signal }),
    });
    const { data, metadata } = parseBody(schema, body, SOURCE);

    return {
      candidates: data.map((place) => {
        const coords = { lat: place.latitude, lon: place.longitude };
        return {
          placeKind: place.type === 'CITY' ? 'city' : 'area',
          city: {
            id: cityId(place.countryCode, coords),
            name: place.name,
            ...(place.region && { region: place.region }),
            country: place.country,
            countryCode: place.countryCode,
            coords,
          },
        };
      }),
      complete: metadata.totalCount <= data.length,
    };
  };
}

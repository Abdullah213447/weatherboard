import geodbKara from '@fixtures/geodb/cities-kara.json';
import geodbLaho from '@fixtures/geodb/cities-laho.json';
import geodbLond from '@fixtures/geodb/cities-lond.json';
import geodbNone from '@fixtures/geodb/cities-no-results.json';
import { createGeoDbSource, type CitySearchPage } from '@/api/geodb';

/** Recorded GeoDB bodies, by the prefix that was searched. */
export const GEODB_FIXTURES = {
  laho: geodbLaho,
  lond: geodbLond,
  kara: geodbKara,
  none: geodbNone,
} as const;

/** Runs a recorded GeoDB body through the real client, exactly as the app would. */
export function pageFromGeoDb(name: keyof typeof GEODB_FIXTURES): Promise<CitySearchPage> {
  const source = createGeoDbSource({
    apiKey: 'test-key',
    fetchJson: () => Promise.resolve(GEODB_FIXTURES[name]),
  });
  return source(name);
}

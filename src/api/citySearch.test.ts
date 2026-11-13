import geodb429 from '@fixtures/geodb/rate-limited-429.json';
import omLaho from '@fixtures/open-meteo-geocoding/search-laho.json';
import omNone from '@fixtures/open-meteo-geocoding/search-no-results.json';
import { cleanCities } from '@/domain/cities';
import { GEODB_FIXTURES, pageFromGeoDb } from '@/test/cities';
import { createGeoDbSource } from './geodb';
import { createOpenMeteoGeocodingSource } from './openMeteoGeocoding';

const label = (city: { name: string; countryCode: string }) => `${city.name} ${city.countryCode}`;

describe('GeoDB results, cleaned (recorded responses)', () => {
  it('"Laho": Lahore appears, first, although GeoDB only files it as two administrative areas', async () => {
    const cities = cleanCities((await pageFromGeoDb('laho')).candidates);

    expect(cities.map(label)).toEqual([
      'Lahore PK',
      'Grand-Lahou CI',
      'Lahojsk BY',
      'Laholm SE',
      'Lahouaza MA',
    ]);
    // "Lahore Division" and "Lahore District" collapse into one entry, and the
    // district (the smaller area, nearer the city itself) is the one kept.
    expect(cities[0]).toMatchObject({
      name: 'Lahore',
      region: 'Punjab',
      country: 'Pakistan',
      coords: { lat: 31.416666666, lon: 74.333333333 },
    });
  });

  it('"Laho": a city replaces the district, municipality or parish of the same place', async () => {
    const { candidates } = await pageFromGeoDb('laho');
    const cities = cleanCities(candidates);

    // Raw: Laholm Municipality, Laholms församling and Laholm (city) are three rows.
    expect(candidates.filter(({ city }) => city.name.startsWith('Laholm'))).toHaveLength(3);
    expect(cities.filter((city) => city.name.startsWith('Laholm'))).toHaveLength(1);
    // The city's own coordinates are used, not the municipality's.
    expect(cities.find((city) => city.name === 'Laholm')?.coords.lat).toBeCloseTo(56.504, 2);
  });

  it('"Lond": London leads; Greater London and the duplicate Londrina are gone', async () => {
    const cities = cleanCities((await pageFromGeoDb('lond')).candidates);

    expect(cities.map(label)).toEqual([
      'London GB',
      'Londrina BR',
      'East London ZA',
      'London CA',
      'Londuimbali AO',
      'New London US',
    ]);
    expect(cities.map((city) => city.name)).not.toContain('Greater London');
  });

  it('"Kara": Karachi leads and Karaj is the city, not Karaj County', async () => {
    const cities = cleanCities((await pageFromGeoDb('kara')).candidates);

    expect(cities.map(label)).toEqual([
      'Karachi PK',
      'Karawang ID',
      'Karaj IR',
      'Karauli IN',
      'Karanganyar ID',
      'Karak PK',
    ]);
    expect(cities[2]?.coords.lat).toBeCloseTo(35.833, 2);
  });

  it('shows at most six', async () => {
    const { candidates } = await pageFromGeoDb('kara');

    expect(candidates).toHaveLength(10);
    expect(cleanCities(candidates)).toHaveLength(6);
    expect(cleanCities(candidates, 3)).toHaveLength(3);
  });

  it('knows whether a page holds every match', async () => {
    expect((await pageFromGeoDb('none')).complete).toBe(true);
    expect((await pageFromGeoDb('none')).candidates).toEqual([]);
    // 31 matches exist for "Laho"; the page has 10.
    expect((await pageFromGeoDb('laho')).complete).toBe(false);
  });
});

describe('createGeoDbSource', () => {
  it('asks for the ten largest places by word prefix, in English, with no type filter', async () => {
    let requested = '';
    let headers: Record<string, string> | undefined;
    const source = createGeoDbSource({
      apiKey: 'test-key',
      fetchJson: (url, options) => {
        requested = url;
        headers = options.headers;
        return Promise.resolve(GEODB_FIXTURES.laho);
      },
    });

    await source('Laho');

    const url = new URL(requested);
    expect(url.host).toBe('wft-geo-db.p.rapidapi.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      namePrefix: 'Laho',
      limit: '10',
      sort: '-population',
      languageCode: 'en',
    });
    expect(headers).toEqual({
      'X-RapidAPI-Key': 'test-key',
      'X-RapidAPI-Host': 'wft-geo-db.p.rapidapi.com',
    });
  });

  it('fails as an auth problem, without a request, when no key is configured', async () => {
    const fetchJson = vi.fn();
    const source = createGeoDbSource({ apiKey: undefined, fetchJson });

    await expect(source('Laho')).rejects.toMatchObject({ kind: 'auth', source: 'geodb' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('rejects the rate-limit body as a bad response if it ever arrives with a 200', async () => {
    const source = createGeoDbSource({
      apiKey: 'test-key',
      fetchJson: () => Promise.resolve(geodb429),
    });

    await expect(source('Laho')).rejects.toMatchObject({ kind: 'bad-response', source: 'geodb' });
  });
});

describe('Open-Meteo geocoding (the backup), recorded responses', () => {
  const source = (body: unknown) =>
    createOpenMeteoGeocodingSource({ fetchJson: () => Promise.resolve(body) });

  it('"Laho": Lahore leads, with its region and country', async () => {
    const page = await source(omLaho)('Laho');
    const cities = cleanCities(page.candidates);

    expect(cities[0]).toMatchObject({
      name: 'Lahore',
      region: 'Punjab',
      country: 'Pakistan',
      countryCode: 'PK',
    });
    // Two villages called Laho in the same Estonian county are one entry.
    expect(cities.filter((city) => label(city) === 'Laho EE')).toHaveLength(1);
    // Fuzzy matches must never be used to answer a longer prefix locally.
    expect(page.complete).toBe(false);
  });

  it('treats a body with no "results" key as no matches, not as an error', async () => {
    await expect(source(omNone)('Zzqxv')).resolves.toEqual({ candidates: [], complete: false });
  });
});

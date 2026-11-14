import {
  cityContext,
  cityId,
  cleanCities,
  decodeCityParam,
  distanceKm,
  encodeCityParam,
  findMatchRange,
  flagEmoji,
  matchesPrefix,
  type CityCandidate,
} from './cities';
import { pageFromGeoDb } from '@/test/cities';
import type { City } from './weather';

const karachi: City = {
  id: 'PK:24.86,67.01',
  name: 'Karachi',
  region: 'Sindh',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 24.86, lon: 67.01 },
};

function candidate(
  name: string,
  region: string,
  lat: number,
  lon: number,
  placeKind: CityCandidate['placeKind'] = 'city',
): CityCandidate {
  const coords = { lat, lon };
  return {
    placeKind,
    city: {
      id: cityId('US', coords),
      name,
      region,
      country: 'United States',
      countryCode: 'US',
      coords,
    },
  };
}

describe('cleanCities', () => {
  it('does not merge different cities just because they are close together', () => {
    // 6 km apart: neighbours, not the same place.
    const cities = cleanCities([
      candidate('San Jose', 'California', 37.3382, -121.8863),
      candidate('Santa Clara', 'California', 37.3541, -121.9552),
    ]);

    expect(cities.map((city) => city.name)).toEqual(['San Jose', 'Santa Clara']);
  });

  it('keeps cities of the same name in different regions', () => {
    const cities = cleanCities([
      candidate('Springfield', 'Illinois', 39.78, -89.65),
      candidate('Springfield', 'Missouri', 37.21, -93.29),
    ]);

    expect(cities).toHaveLength(2);
  });

  it('lets a better name take the position of the entry it replaces', () => {
    const cities = cleanCities([
      candidate('Greater Springfield', 'Illinois', 39.8, -89.6),
      candidate('Chicago', 'Illinois', 41.88, -87.63),
      candidate('Springfield', 'Illinois', 39.78, -89.65),
    ]);

    expect(cities.map((city) => city.name)).toEqual(['Springfield', 'Chicago']);
  });

  it('prefers a district over a division of the same name', () => {
    const cities = cleanCities([
      candidate('Example Division', 'North', 10, 10, 'area'),
      candidate('Example District', 'North', 10.3, 10.3, 'area'),
    ]);

    expect(cities).toHaveLength(1);
    expect(cities[0]).toMatchObject({ name: 'Example', coords: { lat: 10.3, lon: 10.3 } });
  });
});

describe('matchesPrefix', () => {
  it('matches the start of any word, ignoring case, accents and hyphens', () => {
    expect(matchesPrefix('Lahore', 'laho')).toBe(true);
    expect(matchesPrefix('Grand-Lahou', 'Laho')).toBe(true);
    expect(matchesPrefix('East London', 'lond')).toBe(true);
    expect(matchesPrefix('São Paulo', 'sao p')).toBe(true);
  });

  it('does not match the middle of a word or an empty query', () => {
    expect(matchesPrefix('Islamabad', 'lama')).toBe(false);
    expect(matchesPrefix('Lahore', '  ')).toBe(false);
  });
});

describe('findMatchRange', () => {
  it('locates the match at the start or at a later word', () => {
    expect(findMatchRange('Lahore', 'laho')).toEqual([0, 4]);
    expect(findMatchRange('Grand-Lahou', 'Laho')).toEqual([6, 10]);
    expect(findMatchRange('East London', 'lon')).toEqual([5, 8]);
  });

  it('returns null when there is nothing to highlight', () => {
    expect(findMatchRange('Lahore', 'xyz')).toBeNull();
    expect(findMatchRange('Lahore', '')).toBeNull();
  });
});

describe('small helpers', () => {
  it('builds a flag from a country code and nothing from anything else', () => {
    expect(flagEmoji('PK')).toBe('🇵🇰');
    expect(flagEmoji('gb')).toBe('🇬🇧');
    expect(flagEmoji('')).toBe('');
    expect(flagEmoji('PAK')).toBe('');
  });

  it('describes a city by region and country, or country alone', () => {
    expect(cityContext(karachi)).toBe('Sindh, Pakistan');
    const withoutRegion: City = { ...karachi };
    delete withoutRegion.region;
    expect(cityContext(withoutRegion)).toBe('Pakistan');
  });

  it('measures distance in kilometres', () => {
    // Karachi to Lahore is roughly 1,030 km.
    const km = distanceKm({ lat: 24.86, lon: 67.01 }, { lat: 31.55, lon: 74.34 });
    expect(km).toBeGreaterThan(1000);
    expect(km).toBeLessThan(1060);
  });

  it('gives the same id to coordinates that differ by less than about a kilometre', () => {
    expect(cityId('pk', { lat: 24.8607, lon: 67.0011 })).toBe('PK:24.86,67.00');
    expect(cityId('PK', { lat: 24.8591, lon: 66.9983 })).toBe('PK:24.86,67.00');
  });
});

describe('?city= parameter', () => {
  it('round-trips a city', () => {
    const value = encodeCityParam(karachi);

    expect(value).toBe('Karachi~Sindh~PK~24.8600~67.0100');
    expect(decodeCityParam(value)).toEqual(karachi);
  });

  it('round-trips a city with no region and one with a negative longitude', () => {
    const honolulu: City = {
      id: 'US:21.31,-157.86',
      name: 'Honolulu',
      country: 'United States',
      countryCode: 'US',
      coords: { lat: 21.3069, lon: -157.8583 },
    };

    expect(decodeCityParam(encodeCityParam(honolulu))).toEqual(honolulu);
  });

  it.each([
    [null],
    [''],
    ['Karachi'],
    ['Karachi~Sindh~PK~24.86'],
    ['Karachi~Sindh~Pakistan~24.86~67.01'],
    ['Karachi~Sindh~PK~north~67.01'],
    ['Karachi~Sindh~PK~124.86~67.01'],
    ['Karachi~Sindh~PK~24.86~667.01'],
    ['Karachi~Sindh~PK~~'],
    ['~Sindh~PK~24.86~67.01'],
  ])('rejects %j', (value) => {
    expect(decodeCityParam(value)).toBeNull();
  });
});

describe('ranking by where the match is', () => {
  const names = async (fixture: 'par' | 'laho' | 'lond', query: string, limit = 10) =>
    cleanCities((await pageFromGeoDb(fixture)).candidates, limit, query).map((city) => city.name);

  it('puts Paris first for "Par", ahead of larger places that match on a later word', async () => {
    // GeoDB's own order starts with North and South 24 Parganas, both more populous than Paris.
    expect(await names('par', 'Par')).toEqual([
      'Paris',
      'Parbhani',
      'Parvathipuram Manyam',
      'Parachinar',
      'North 24 Parganas',
      'South 24 Parganas',
      'La Matanza Partido',
      'La Plata Partido',
      'Lomas de Zamora Partido',
      'General Pueyrredón Partido',
    ]);
  });

  it('keeps population order inside each group', async () => {
    const withoutQuery = cleanCities((await pageFromGeoDb('par')).candidates, 10).map(
      (c) => c.name,
    );
    const ranked = await names('par', 'Par');
    const starts = (name: string) => name.startsWith('Par');
    expect(ranked.filter(starts)).toEqual(withoutQuery.filter(starts));
    expect(ranked.filter((name) => !starts(name))).toEqual(
      withoutQuery.filter((name) => !starts(name)),
    );
  });

  it('still leads with Lahore for "Laho", and moves only the later-word match down', async () => {
    const ranked = await names('laho', 'Laho');
    expect(ranked[0]).toBe('Lahore');
    expect(ranked.at(-1)).toBe('Grand-Lahou');
    expect(ranked.slice(0, -1).every((name) => name.startsWith('Laho'))).toBe(true);
  });

  it('still leads with London for "Lond", and moves East London and New London down', async () => {
    const ranked = await names('lond', 'Lond');
    expect(ranked[0]).toBe('London');
    expect(ranked.slice(-2)).toEqual(['East London', 'New London']);
  });

  it('changes nothing when no query is given', async () => {
    const page = await pageFromGeoDb('lond');
    expect(cleanCities(page.candidates, 6, '')).toEqual(cleanCities(page.candidates, 6));
  });
});

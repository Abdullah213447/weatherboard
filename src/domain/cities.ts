import type { City, Coordinates } from './weather.js';

/** A search hit before clean-up, with what the provider said it is. */
export type CityCandidate = {
  city: City;
  /** `area` is an administrative area (district, county...) rather than a settlement. */
  placeKind: 'city' | 'area';
};

/**
 * A stable id that does not depend on which provider found the city, and
 * that can be rebuilt from a shared link: country plus coordinates rounded
 * to about a kilometre.
 */
export function cityId(countryCode: string, coords: Coordinates): string {
  return `${countryCode.toUpperCase()}:${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`;
}

/** Lower-case, accents removed, hyphens as spaces: "Grand-Lahou" equals "grand lahou". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-‐-―]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when any word of `name` starts with `query`, which is how the search API matches. */
export function matchesPrefix(name: string, query: string): boolean {
  const target = normalizeName(query);
  if (target === '') return false;
  const normalized = normalizeName(name);
  return normalized.startsWith(target) || normalized.includes(` ${target}`);
}

/**
 * Where `query` matches inside `name`, as [start, end) character offsets, for
 * highlighting. Null when the match cannot be located letter for letter.
 */
export function findMatchRange(name: string, query: string): [number, number] | null {
  const target = normalizeName(query);
  if (target === '') return null;
  // Accent removal can change string length, so only highlight when it does not.
  const comparable = normalizeName(name);
  if (comparable.length !== name.trim().length) return null;
  const offset = name.length - name.trimStart().length;
  const index = comparable.startsWith(target) ? 0 : comparable.indexOf(` ${target}`);
  if (index === -1) return null;
  const start = offset + (index === 0 ? 0 : index + 1);
  return [start, start + target.length];
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Suffixes that mark an administrative area, split by how large the area tends to be. */
const LOCAL_AREA = /\s+(district|county|municipality|department|parish|township|församling)$/i;
const BROAD_AREA = /\s+(division|region|province|governorate|prefecture|state)$/i;
const SAME_PLACE_KM = 25;

type Ranked = {
  city: City;
  /** Higher is the better way to refer to the place. */
  preference: number;
  comparable: string;
};

/**
 * Names an area the way a person would look for it ("Lahore District" is
 * "Lahore") and scores how good a representative of the place it is:
 * a city beats a district, a district beats a division, and all of them beat
 * a "Greater X" conurbation.
 */
function rank({ city, placeKind }: CityCandidate): Ranked {
  let name = city.name.trim();
  let preference: number;
  if (/^greater\s+/i.test(name)) {
    preference = 0;
  } else if (placeKind === 'city') {
    preference = 3;
  } else if (BROAD_AREA.test(name)) {
    name = name.replace(BROAD_AREA, '');
    preference = 1;
  } else {
    name = name.replace(LOCAL_AREA, '');
    preference = 2;
  }
  return { city: { ...city, name }, preference, comparable: normalizeName(name) };
}

function isSamePlace(a: Ranked, b: Ranked): boolean {
  const sameRegion =
    a.city.countryCode === b.city.countryCode && (a.city.region ?? '') === (b.city.region ?? '');
  if (sameRegion && a.comparable === b.comparable) return true;
  // Close together AND related by name: "Greater London" and "London", or
  // "Karaj County" and "Karaj". Distance alone would merge real neighbours
  // such as San Jose and Santa Clara.
  const related = a.comparable.includes(b.comparable) || b.comparable.includes(a.comparable);
  return related && distanceKm(a.city.coords, b.city.coords) <= SAME_PLACE_KM;
}

/**
 * Turns raw search hits into the list shown to the user: one entry per
 * place, named plainly, in the provider's order (largest first).
 */
export function cleanCities(candidates: readonly CityCandidate[], limit = 6): City[] {
  const kept: Ranked[] = [];
  for (const candidate of candidates) {
    const next = rank(candidate);
    const existing = kept.findIndex((entry) => isSamePlace(entry, next));
    if (existing === -1) {
      kept.push(next);
    } else if (next.preference > (kept[existing]?.preference ?? 0)) {
      // A better name for a place already listed takes over its position.
      kept[existing] = next;
    }
  }
  return kept.slice(0, limit).map((entry) => entry.city);
}

/** A country's flag as an emoji, built from its two-letter code. Empty if the code is not one. */
export function flagEmoji(countryCode: string): string {
  if (!/^[a-z]{2}$/i.test(countryCode)) return '';
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  const upper = countryCode.toUpperCase();
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + upper.charCodeAt(0) - 65,
    REGIONAL_INDICATOR_A + upper.charCodeAt(1) - 65,
  );
}

/** "Sindh, Pakistan" or just "Pakistan": what tells two cities of the same name apart. */
export function cityContext(city: City): string {
  return city.region ? `${city.region}, ${city.country}` : city.country;
}

const SEPARATOR = '~';

/** The value of the `?city=` parameter: readable, and enough to fetch weather on its own. */
export function encodeCityParam(city: City): string {
  const clean = (part: string) => part.replaceAll(SEPARATOR, ' ');
  return [
    clean(city.name),
    clean(city.region ?? ''),
    city.countryCode,
    city.coords.lat.toFixed(4),
    city.coords.lon.toFixed(4),
  ].join(SEPARATOR);
}

/** Rebuilds a city from a `?city=` value. Null for anything that is not one. */
export function decodeCityParam(value: string | null): City | null {
  if (!value) return null;
  const parts = value.split(SEPARATOR);
  if (parts.length !== 5) return null;
  const [name = '', region = '', countryCode = '', latText = '', lonText = ''] = parts;
  const lat = Number(latText);
  const lon = Number(lonText);
  const valid =
    name.trim() !== '' &&
    name.length <= 80 &&
    /^[a-z]{2}$/i.test(countryCode) &&
    latText !== '' &&
    lonText !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  if (!valid) return null;

  const code = countryCode.toUpperCase();
  let country = code;
  try {
    country = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    // An unknown code keeps the code itself as the country label.
  }
  const coords = { lat, lon };
  return {
    id: cityId(code, coords),
    name: name.trim(),
    ...(region.trim() !== '' && { region: region.trim() }),
    country,
    countryCode: code,
    coords,
  };
}

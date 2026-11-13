export type UnitSystem = 'metric' | 'imperial';

/** Countries that use Fahrenheit day to day. */
const FAHRENHEIT_REGIONS: ReadonlySet<string> = new Set([
  'US',
  'BS',
  'BZ',
  'KY',
  'LR',
  'PW',
  'FM',
  'MH',
]);

/** The unit system a visitor most likely expects, judged from their browser locale. */
export function defaultUnitSystem(locale: string | undefined): UnitSystem {
  if (!locale) return 'metric';
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region && FAHRENHEIT_REGIONS.has(region) ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/** Whole degrees in the chosen system. Never "-0". */
export function roundTemperature(celsius: number, system: UnitSystem): number {
  const rounded = Math.round(system === 'imperial' ? toFahrenheit(celsius) : celsius);
  return rounded === 0 ? 0 : rounded;
}

/** "31°". The unit letter is left out on purpose; the toggle says which one applies. */
export function formatTemperature(celsius: number, system: UnitSystem): string {
  // U+2212 is a true minus sign: same width as a digit, so columns stay aligned.
  return `${String(roundTemperature(celsius, system)).replace('-', '−')}°`;
}

export const TEMPERATURE_UNIT: Record<UnitSystem, { symbol: string; name: string }> = {
  metric: { symbol: '°C', name: 'Celsius' },
  imperial: { symbol: '°F', name: 'Fahrenheit' },
};

const KMH_PER_MS = 3.6;
const MPH_PER_MS = 2.236936;

/** Wind follows temperature: km/h with Celsius, mph with Fahrenheit. */
export function formatWindSpeed(metresPerSecond: number, system: UnitSystem): string {
  return system === 'imperial'
    ? `${String(Math.round(metresPerSecond * MPH_PER_MS))} mph`
    : `${String(Math.round(metresPerSecond * KMH_PER_MS))} km/h`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** The compass point a bearing is closest to. Wind bearings say where the wind comes from. */
export function compassPoint(degrees: number): (typeof COMPASS)[number] {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  // The index is always 0-7 by construction.
  return COMPASS[index] ?? 'N';
}

import { conditionLabel } from './conditionLabel';
import { positionOnScale, rangeBars } from './forecastRange';
import { dayLabel, formatLocalDate, formatLocalTime, localDateKey, relativeTime } from './time';
import {
  compassPoint,
  defaultUnitSystem,
  formatTemperature,
  formatWindSpeed,
  roundTemperature,
  toFahrenheit,
} from './units';
import type { DailyForecast } from './weather';

describe('temperature', () => {
  it('converts Celsius to Fahrenheit', () => {
    expect(toFahrenheit(0)).toBe(32);
    expect(toFahrenheit(100)).toBe(212);
    expect(toFahrenheit(-40)).toBe(-40);
  });

  it.each([
    [26.06, 'metric', '26°'],
    [26.5, 'metric', '27°'],
    [26.49, 'metric', '26°'],
    [26.06, 'imperial', '79°'], // 78.908
    [0.4, 'metric', '0°'],
    [-0.4, 'metric', '0°'], // never "-0°"
    [-0.5, 'metric', '0°'], // Math.round rounds half towards +infinity
    [-0.6, 'metric', '−1°'],
    [-17.9, 'imperial', '0°'], // -0.22 °F
    [-12.3, 'metric', '−12°'],
  ] as const)('formats %d °C in %s as %s', (celsius, system, expected) => {
    expect(formatTemperature(celsius, system)).toBe(expected);
  });

  it('rounds after converting, not before', () => {
    // 20.4 °C is 68.72 °F: 69, not round(20) -> 68.
    expect(roundTemperature(20.4, 'imperial')).toBe(69);
  });
});

describe('wind', () => {
  it('shows km/h with Celsius and mph with Fahrenheit', () => {
    expect(formatWindSpeed(1.54, 'metric')).toBe('6 km/h'); // 5.544
    expect(formatWindSpeed(1.54, 'imperial')).toBe('3 mph'); // 3.445
    expect(formatWindSpeed(0, 'metric')).toBe('0 km/h');
    expect(formatWindSpeed(10, 'metric')).toBe('36 km/h');
    expect(formatWindSpeed(10, 'imperial')).toBe('22 mph');
  });

  it.each([
    [0, 'N'],
    [22, 'N'],
    [23, 'NE'],
    [90, 'E'],
    [270, 'W'],
    [337, 'NW'],
    [338, 'N'],
    [360, 'N'],
    [-90, 'W'],
    [450, 'E'],
  ] as const)('names %d° as %s', (degrees, point) => {
    expect(compassPoint(degrees)).toBe(point);
  });
});

describe('defaultUnitSystem', () => {
  it('uses Fahrenheit for the United States and Celsius elsewhere', () => {
    expect(defaultUnitSystem('en-US')).toBe('imperial');
    expect(defaultUnitSystem('es-US')).toBe('imperial');
    expect(defaultUnitSystem('en-GB')).toBe('metric');
    expect(defaultUnitSystem('ur-PK')).toBe('metric');
    expect(defaultUnitSystem('ja')).toBe('metric');
  });

  it('falls back to Celsius for a missing or malformed locale', () => {
    expect(defaultUnitSystem(undefined)).toBe('metric');
    expect(defaultUnitSystem('not a locale')).toBe('metric');
  });
});

describe('city-local time', () => {
  // 20:38:33 UTC on 13 Nov 2026, the moment the Karachi fixture was observed.
  const instant = 1794602313000;

  it('shows the time and date where the city is, not where the viewer is', () => {
    expect(formatLocalTime(instant, 18000, 'en-GB')).toBe('1:38');
    expect(formatLocalTime(instant, -36000, 'en-GB')).toBe('10:38');
    expect(formatLocalDate(instant, 18000, 'en-GB')).toBe('Saturday 14 November');
    expect(formatLocalDate(instant, -36000, 'en-GB')).toBe('Friday 13 November');
    expect(localDateKey(instant, 18000)).toBe('2026-11-14');
    expect(localDateKey(instant, -36000)).toBe('2026-11-13');
  });

  it('names forecast days', () => {
    expect(dayLabel('2026-11-14', '2026-11-14', 'en-GB')).toBe('Today');
    expect(dayLabel('2026-11-15', '2026-11-14', 'en-GB')).toBe('Sunday');
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000;
  it.each([
    [0, 'just now'],
    [59_999, 'just now'],
    [60_000, '1 min ago'],
    [4 * 60_000 + 30_000, '4 min ago'],
    [59 * 60_000 + 59_000, '59 min ago'],
    [60 * 60_000, '1 hr ago'],
    [23 * 60 * 60_000, '23 hr ago'],
    [24 * 60 * 60_000, '1 day ago'],
    [3 * 24 * 60 * 60_000, '3 days ago'],
  ])('%d ms ago reads as "%s"', (elapsed, expected) => {
    expect(relativeTime(now - elapsed, now)).toBe(expected);
  });

  it('treats a timestamp slightly in the future as now', () => {
    expect(relativeTime(now + 5000, now)).toBe('just now');
  });
});

describe('conditionLabel', () => {
  it('distinguishes a clear day from a clear night and names the rest plainly', () => {
    expect(conditionLabel({ kind: 'clear', isDay: true })).toBe('Sunny');
    expect(conditionLabel({ kind: 'clear', isDay: false })).toBe('Clear night');
    expect(conditionLabel({ kind: 'partly-cloudy', isDay: false })).toBe('Partly cloudy');
    expect(conditionLabel({ kind: 'freezing-rain', isDay: true })).toBe('Freezing rain');
  });
});

describe('range bars', () => {
  const day = (minC: number, maxC: number): DailyForecast => ({
    date: '2026-11-14',
    minC,
    maxC,
    condition: { kind: 'clear', isDay: true },
    partial: false,
  });

  it('scales every day against the coldest low and warmest high of the forecast', () => {
    const bars = rangeBars([day(10, 20), day(15, 30), day(20, 25)]);

    expect(bars).toEqual([
      { startPct: 0, widthPct: 50 },
      { startPct: 25, widthPct: 75 },
      { startPct: 50, widthPct: 25 },
    ]);
  });

  it('keeps a day with a single temperature visible and inside the track', () => {
    const [, flat] = rangeBars([day(10, 20), day(20, 20)]);

    expect(flat?.widthPct).toBe(4);
    expect((flat?.startPct ?? 0) + (flat?.widthPct ?? 0)).toBe(100);
  });

  it('fills the track when every day has the same temperature', () => {
    expect(rangeBars([day(5, 5), day(5, 5)])).toEqual([
      { startPct: 0, widthPct: 100 },
      { startPct: 0, widthPct: 100 },
    ]);
    expect(positionOnScale(5, [day(5, 5)])).toBe(50);
  });

  it('places the current temperature on the same scale, clamped to the track', () => {
    const days = [day(10, 20), day(15, 30)];

    expect(positionOnScale(20, days)).toBe(50);
    expect(positionOnScale(5, days)).toBe(0);
    expect(positionOnScale(40, days)).toBe(100);
  });
});

import type { DailyForecast } from './weather';

export type RangeBar = {
  /** Where the day's low sits across the whole forecast's span, 0-100. */
  startPct: number;
  /** How much of the span the day's low-to-high range covers, 0-100. */
  widthPct: number;
};

/** A chance of precipitation below this is not worth a line of its own. */
export const MEANINGFUL_CHANCE_PCT = 20;
/** A bar is never thinner than this, so a day with one reading is still visible. */
const MIN_WIDTH_PCT = 4;

function span(days: readonly DailyForecast[]): { min: number; range: number } {
  const min = Math.min(...days.map((day) => day.minC));
  const max = Math.max(...days.map((day) => day.maxC));
  return { min, range: max - min };
}

/**
 * Positions each day's low-to-high bar on one shared scale, from the coldest
 * low to the warmest high of the forecast, so days can be compared at a glance.
 */
export function rangeBars(days: readonly DailyForecast[]): RangeBar[] {
  const { min, range } = span(days);
  return days.map((day) => {
    if (range === 0) return { startPct: 0, widthPct: 100 };
    const startPct = ((day.minC - min) / range) * 100;
    const widthPct = Math.max(((day.maxC - day.minC) / range) * 100, MIN_WIDTH_PCT);
    // A widened bar must not spill past the end of the track.
    return { startPct: Math.min(startPct, 100 - widthPct), widthPct };
  });
}

/** Where a temperature sits on the same scale, clamped to the track. */
export function positionOnScale(celsius: number, days: readonly DailyForecast[]): number {
  const { min, range } = span(days);
  if (range === 0) return 50;
  return Math.min(100, Math.max(0, ((celsius - min) / range) * 100));
}

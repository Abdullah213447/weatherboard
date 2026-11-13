import type { Condition, CurrentWeather, DailyForecast } from './weather';

/** One reading from a provider that only publishes a forecast in time steps. */
export type ForecastSlot = {
  /** Epoch milliseconds. */
  time: number;
  temperatureC: number;
  condition: Condition;
  precipitationChancePct?: number;
};

type AggregateInput = {
  slots: readonly ForecastSlot[];
  /** Epoch milliseconds. Decides which local date is "today". */
  now: number;
  /** The city's offset from UTC. Days are the city's days, not the viewer's. */
  utcOffsetSeconds: number;
  /** Folded into today, whose earlier hours are no longer in the forecast. */
  current: Pick<CurrentWeather, 'temperatureC' | 'condition'>;
  days?: number;
};

const DAY_MS = 86_400_000;
/** A complete day of 3-hourly readings. */
const SLOTS_PER_FULL_DAY = 8;
/** Readings between these local hours can stand for "the day's weather". */
const MIDDAY_FROM = 9;
const MIDDAY_TO = 15;

/** Shifts an instant so that its UTC fields read as the city's local time. */
function toLocal(time: number, utcOffsetSeconds: number): Date {
  return new Date(time + utcOffsetSeconds * 1000);
}

function localDate(time: number, utcOffsetSeconds: number): string {
  return toLocal(time, utcOffsetSeconds).toISOString().slice(0, 10);
}

function localHour(time: number, utcOffsetSeconds: number): number {
  const local = toLocal(time, utcOffsetSeconds);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

/** The reading closest to local noon; the earlier one wins a tie. */
function closestToNoon(
  slots: readonly ForecastSlot[],
  utcOffsetSeconds: number,
): ForecastSlot | undefined {
  let best: ForecastSlot | undefined;
  let bestDistance = Infinity;
  for (const slot of slots) {
    const distance = Math.abs(localHour(slot.time, utcOffsetSeconds) - 12);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Turns time-step readings into one entry per local day, today first.
 *
 * - Highs and lows are the extremes of that day's readings. Today also
 *   includes the current temperature, and is always marked partial because
 *   the hours already gone are missing.
 * - A day's condition is the reading nearest local noon, taken from the
 *   09:00-15:00 window so a night-time reading never labels a day. If today
 *   has no reading left in that window, the current condition is used.
 * - Returns fewer than `days` entries only if the readings run out.
 */
export function aggregateDaily({
  slots,
  now,
  utcOffsetSeconds,
  current,
  days = 5,
}: AggregateInput): DailyForecast[] {
  const byDate = new Map<string, ForecastSlot[]>();
  for (const slot of slots) {
    const date = localDate(slot.time, utcOffsetSeconds);
    const group = byDate.get(date);
    if (group) group.push(slot);
    else byDate.set(date, [slot]);
  }

  const result: DailyForecast[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = localDate(now + index * DAY_MS, utcOffsetSeconds);
    const daySlots = byDate.get(date) ?? [];
    const isToday = index === 0;
    if (!isToday && daySlots.length === 0) break;

    const temperatures = daySlots.map((slot) => slot.temperatureC);
    if (isToday) temperatures.push(current.temperatureC);

    const midday = closestToNoon(
      daySlots.filter((slot) => {
        const hour = localHour(slot.time, utcOffsetSeconds);
        return hour >= MIDDAY_FROM && hour <= MIDDAY_TO;
      }),
      utcOffsetSeconds,
    );
    const representative =
      midday ?? (isToday ? undefined : closestToNoon(daySlots, utcOffsetSeconds));
    const condition: Condition = representative
      ? { kind: representative.condition.kind, isDay: true }
      : current.condition;

    const chances = daySlots.flatMap((slot) =>
      slot.precipitationChancePct === undefined ? [] : [slot.precipitationChancePct],
    );

    result.push({
      date,
      minC: Math.min(...temperatures),
      maxC: Math.max(...temperatures),
      condition,
      ...(chances.length > 0 && { precipitationChancePct: Math.max(...chances) }),
      partial: isToday || daySlots.length < SLOTS_PER_FULL_DAY,
    });
  }
  return result;
}

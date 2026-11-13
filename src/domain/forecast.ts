import type { Condition, ConditionKind, CurrentWeather, DailyForecast } from './weather';

/** One reading from a provider that only publishes a forecast in time steps. */
export type ForecastSlot = {
  /** Epoch milliseconds. */
  time: number;
  temperatureC: number;
  condition: Condition;
  precipitationChancePct?: number;
  /** Amount the provider expects in this step, when it reports one. */
  precipitationMm?: number;
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
/** Readings between these local hours are "the day"; a night reading never labels one. */
const DAYTIME_FROM = 6;
const DAYTIME_TO = 18;
/** With no precipitation worth mentioning, the reading nearest noon in this window labels the day. */
const MIDDAY_FROM = 9;
const MIDDAY_TO = 15;
/** A chance of precipitation at or above this is worth telling the user about. */
const MEANINGFUL_CHANCE_PCT = 50;
/** So is this much in one 3-hour reading. Below it is a passing shower, not a rainy day. */
const MEANINGFUL_AMOUNT_MM = 0.5;

/** Precipitation, most disruptive first. Someone planning their day needs the worst of these. */
const PRECIPITATION_BY_SEVERITY: readonly ConditionKind[] = [
  'thunderstorm',
  'snow',
  'freezing-rain',
  'rain',
  'drizzle',
];

function isMeaningfulPrecipitation(slot: ForecastSlot): boolean {
  return (
    PRECIPITATION_BY_SEVERITY.includes(slot.condition.kind) &&
    ((slot.precipitationMm ?? 0) >= MEANINGFUL_AMOUNT_MM ||
      (slot.precipitationChancePct ?? 0) >= MEANINGFUL_CHANCE_PCT)
  );
}

/** The most severe precipitation kind among the readings, if any counts as meaningful. */
function worstPrecipitation(slots: readonly ForecastSlot[]): ConditionKind | undefined {
  const kinds = new Set(slots.filter(isMeaningfulPrecipitation).map((slot) => slot.condition.kind));
  return PRECIPITATION_BY_SEVERITY.find((kind) => kinds.has(kind));
}

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
 * - A day's condition answers "what should I plan for?". If any daytime
 *   reading (06:00-18:00 local) has meaningful precipitation (a 50% chance
 *   or more, or at least 0.5 mm in the reading), the most severe
 *   kind labels the day, so an overcast noon followed by an afternoon of rain
 *   reads as rain. Otherwise the reading nearest local noon labels it.
 * - Today follows the same rule over the readings that are left, and counts
 *   precipitation falling right now. With nothing left to go on, it shows
 *   the current condition.
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

    const inWindow = (from: number, to: number) =>
      daySlots.filter((slot) => {
        const hour = localHour(slot.time, utcOffsetSeconds);
        return hour >= from && hour <= to;
      });

    const daytime = inWindow(DAYTIME_FROM, DAYTIME_TO);
    // Rain that is falling now is as meaningful as it gets.
    const fallingNow =
      isToday && current.condition.isDay
        ? [
            {
              time: now,
              temperatureC: current.temperatureC,
              condition: current.condition,
              precipitationChancePct: 100,
            },
          ]
        : [];
    const precipitation = worstPrecipitation([...daytime, ...fallingNow]);
    const midday = closestToNoon(inWindow(MIDDAY_FROM, MIDDAY_TO), utcOffsetSeconds);
    const fallback = isToday ? undefined : closestToNoon(daySlots, utcOffsetSeconds);

    let condition: Condition;
    if (precipitation) condition = { kind: precipitation, isDay: true };
    else if (midday) condition = { kind: midday.condition.kind, isDay: true };
    else if (fallback) condition = { kind: fallback.condition.kind, isDay: true };
    else condition = current.condition;

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

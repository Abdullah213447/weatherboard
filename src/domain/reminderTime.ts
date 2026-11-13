/**
 * When a daily reminder fires. Shared by the server (which schedules) and the
 * app (which shows "next reminder"), so both always agree.
 *
 * A reminder is "HH:mm in this time zone, once per local day". Everything is
 * worked out from the zone's rules through Intl, never from a stored offset,
 * so daylight-saving changes need no special handling by callers.
 */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function parseTime(time: string): { hour: number; minute: number } | null {
  const match = TIME.exec(time);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

/** The date and time a clock on the wall in `timeZone` shows at `instant`. */
function wallClock(instant: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** How far the zone's wall clock is ahead of UTC at `instant`, in minutes. */
function offsetMinutes(instant: number, timeZone: string): number {
  const wall = wallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return Math.round((asUtc - Math.floor(instant / MINUTE) * MINUTE) / MINUTE);
}

/**
 * The first instant at which the wall clock in `timeZone` shows the given
 * date and time.
 *
 * - A time that happens twice (clocks going back) resolves to the first.
 * - A time that never happens (clocks going forward) resolves to the same
 *   distance after the change: 02:30 on a day that jumps from 02:00 to 03:00
 *   becomes 03:30.
 */
function firstInstantOf({ year, month, day, hour, minute }: WallClock, timeZone: string): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Whatever offsets are in force around that moment are the only candidates.
  const before = offsetMinutes(naive - DAY, timeZone);
  const offsets = new Set([
    before,
    offsetMinutes(naive, timeZone),
    offsetMinutes(naive + DAY, timeZone),
  ]);
  const matches = [...offsets]
    .map((offset) => naive - offset * MINUTE)
    .filter((candidate) => {
      const wall = wallClock(candidate, timeZone);
      return wall.day === day && wall.hour === hour && wall.minute === minute;
    })
    .sort((a, b) => a - b);
  return matches[0] ?? naive - before * MINUTE;
}

/**
 * The next instant, strictly after `after`, at which a reminder set for
 * `time` in `timeZone` fires. Epoch milliseconds.
 *
 * It looks for the reminder on the local date of `after`, then the following
 * dates, and takes each date's first occurrence only. So a day when the time
 * happens twice still produces exactly one reminder.
 */
export function nextFireAt(time: string, timeZone: string, after: number): number {
  const parsed = parseTime(time);
  if (!parsed) throw new RangeError(`Not a time in HH:mm form: "${time}".`);
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Not a time zone: "${timeZone}".`);

  const today = wallClock(after, timeZone);
  for (let ahead = 0; ahead <= 3; ahead += 1) {
    // Date.UTC normalises an overflowing day, which is all that is needed to step dates.
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
    const candidate = firstInstantOf(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        ...parsed,
      },
      timeZone,
    );
    if (candidate > after) return candidate;
  }
  // Unreachable for real zones: a local date is never skipped three times running.
  throw new RangeError(`No upcoming ${time} found in ${timeZone}.`);
}

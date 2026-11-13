/**
 * Times in this app belong to the city being viewed, not to the viewer.
 * Each function takes an instant and the city's offset from UTC.
 */

function shifted(instant: number, utcOffsetSeconds: number): Date {
  return new Date(instant + utcOffsetSeconds * 1000);
}

/** "14:05", or "2:05 pm" where the locale prefers a 12-hour clock. */
export function formatLocalTime(
  instant: number,
  utcOffsetSeconds: number,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(shifted(instant, utcOffsetSeconds));
}

/** "Saturday 14 November". */
export function formatLocalDate(
  instant: number,
  utcOffsetSeconds: number,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(shifted(instant, utcOffsetSeconds));
}

/** The city's calendar date as YYYY-MM-DD. */
export function localDateKey(instant: number, utcOffsetSeconds: number): string {
  return shifted(instant, utcOffsetSeconds).toISOString().slice(0, 10);
}

/** "Today", or the weekday of a YYYY-MM-DD date ("Sunday"). */
export function dayLabel(date: string, today: string, locale?: string): string {
  if (date === today) return 'Today';
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "4 min ago", "2 hr ago", "3 days ago". */
export function relativeTime(then: number, now: number): string {
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))} hr ago`;
  const days = Math.floor(elapsed / DAY);
  return `${String(days)} day${days === 1 ? '' : 's'} ago`;
}

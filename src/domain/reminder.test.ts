import { reminderText } from './reminderText';
import { isValidTimeZone, nextFireAt, parseTime } from './reminderTime';

const at = (iso: string) => Date.parse(iso);
const iso = (instant: number) => new Date(instant).toISOString();

describe('parseTime and isValidTimeZone', () => {
  it('accepts HH:mm and nothing else', () => {
    expect(parseTime('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
    for (const bad of ['', '7:30', '24:00', '12:60', '07:30:00', 'noon', '07.30']) {
      expect(parseTime(bad)).toBeNull();
    }
  });

  it('recognises IANA zones', () => {
    expect(isValidTimeZone('Asia/Karachi')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('nextFireAt', () => {
  it('is later the same day when the time has not come yet', () => {
    // 05:00 in Karachi (UTC+5) is 00:00Z; 07:30 there is 02:30Z.
    expect(iso(nextFireAt('07:30', 'Asia/Karachi', at('2026-11-14T00:00:00Z')))).toBe(
      '2026-11-14T02:30:00.000Z',
    );
  });

  it('is tomorrow when the time has passed, or is exactly now', () => {
    expect(iso(nextFireAt('07:30', 'Asia/Karachi', at('2026-11-14T02:30:00Z')))).toBe(
      '2026-11-15T02:30:00.000Z',
    );
    expect(iso(nextFireAt('07:30', 'Asia/Karachi', at('2026-11-14T09:00:00Z')))).toBe(
      '2026-11-15T02:30:00.000Z',
    );
  });

  it('follows the zone, not UTC: the same instant gives different answers', () => {
    const now = at('2026-11-14T12:00:00Z');

    expect(iso(nextFireAt('07:30', 'Asia/Tokyo', now))).toBe('2026-11-14T22:30:00.000Z');
    expect(iso(nextFireAt('07:30', 'America/Los_Angeles', now))).toBe('2026-11-14T15:30:00.000Z');
  });

  describe('clocks going forward (New York, 8 March 2026, 02:00 becomes 03:00)', () => {
    it('moves a time that does not exist that day forward by the gap', () => {
      // 02:30 never happens; the reminder arrives at 03:30 EDT, which is 07:30Z.
      expect(iso(nextFireAt('02:30', 'America/New_York', at('2026-03-08T05:00:00Z')))).toBe(
        '2026-03-08T07:30:00.000Z',
      );
    });

    it('is back at the usual wall time the next day, now in summer time', () => {
      expect(iso(nextFireAt('02:30', 'America/New_York', at('2026-03-08T07:30:00Z')))).toBe(
        '2026-03-09T06:30:00.000Z',
      );
    });

    it('keeps an ordinary morning time at the same wall-clock time across the change', () => {
      // 07:30 EST is 12:30Z on the 7th; 07:30 EDT is 11:30Z on the 8th: 23 hours later.
      const saturday = nextFireAt('07:30', 'America/New_York', at('2026-03-07T06:00:00Z'));
      const sunday = nextFireAt('07:30', 'America/New_York', saturday);

      expect(iso(saturday)).toBe('2026-03-07T12:30:00.000Z');
      expect(iso(sunday)).toBe('2026-03-08T11:30:00.000Z');
    });
  });

  describe('clocks going back (New York, 1 November 2026, 02:00 becomes 01:00)', () => {
    it('fires at the first of the two 01:30s', () => {
      // 01:30 EDT is 05:30Z; the second 01:30 (EST) would be 06:30Z.
      expect(iso(nextFireAt('01:30', 'America/New_York', at('2026-11-01T04:00:00Z')))).toBe(
        '2026-11-01T05:30:00.000Z',
      );
    });

    it('does not fire again at the second 01:30: the next one is tomorrow', () => {
      const first = at('2026-11-01T05:30:00Z');

      expect(iso(nextFireAt('01:30', 'America/New_York', first))).toBe('2026-11-02T06:30:00.000Z');
      // Even asked between the two occurrences.
      expect(iso(nextFireAt('01:30', 'America/New_York', at('2026-11-01T06:00:00Z')))).toBe(
        '2026-11-02T06:30:00.000Z',
      );
    });

    it('produces exactly one reminder per local day across a whole week of the change', () => {
      let cursor = at('2026-10-29T00:00:00Z');
      const fired: string[] = [];
      for (let count = 0; count < 7; count += 1) {
        cursor = nextFireAt('01:30', 'America/New_York', cursor);
        fired.push(
          new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(cursor),
        );
      }

      expect(new Set(fired).size).toBe(7);
      expect(fired[0]).toBe('2026-10-29');
      expect(fired[6]).toBe('2026-11-04');
    });
  });

  describe('near midnight', () => {
    it('handles 00:00 and 23:59', () => {
      const lateEvening = at('2026-11-14T18:30:00Z'); // 23:30 in Karachi

      expect(iso(nextFireAt('23:59', 'Asia/Karachi', lateEvening))).toBe(
        '2026-11-14T18:59:00.000Z',
      );
      expect(iso(nextFireAt('00:00', 'Asia/Karachi', lateEvening))).toBe(
        '2026-11-14T19:00:00.000Z',
      );
    });

    it('rolls over the month and the year', () => {
      expect(iso(nextFireAt('00:05', 'UTC', at('2026-12-31T23:59:00Z')))).toBe(
        '2027-01-01T00:05:00.000Z',
      );
    });
  });

  describe('either side of the date line', () => {
    const now = at('2026-11-14T10:30:00Z');

    it('Kiritimati, UTC+14: it is already the 15th there', () => {
      // 00:30 on the 15th locally. 07:30 on the 15th is 17:30Z on the 14th.
      expect(iso(nextFireAt('07:30', 'Pacific/Kiritimati', now))).toBe('2026-11-14T17:30:00.000Z');
    });

    it('Pago Pago, UTC-11: it is still the 13th there', () => {
      // 23:30 on the 13th locally. 07:30 on the 14th is 18:30Z on the 14th.
      expect(iso(nextFireAt('07:30', 'Pacific/Pago_Pago', now))).toBe('2026-11-14T18:30:00.000Z');
    });

    it('the two are 25 hours apart on the clock but fire an hour apart', () => {
      const east = nextFireAt('07:30', 'Pacific/Kiritimati', now);
      const west = nextFireAt('07:30', 'Pacific/Pago_Pago', now);

      expect(west - east).toBe(60 * 60 * 1000);
    });
  });

  it('handles zones with a half-hour and a 45-minute offset', () => {
    const now = at('2026-11-14T00:00:00Z');

    expect(iso(nextFireAt('07:30', 'Asia/Kolkata', now))).toBe('2026-11-14T02:00:00.000Z');
    expect(iso(nextFireAt('07:30', 'Asia/Kathmandu', now))).toBe('2026-11-14T01:45:00.000Z');
  });

  it('always returns a time strictly after "after", within two days', () => {
    const zones = [
      'Asia/Karachi',
      'America/New_York',
      'Europe/London',
      'Australia/Lord_Howe',
      'UTC',
    ];
    for (const zone of zones) {
      for (let day = 0; day < 370; day += 7) {
        const after = at('2026-01-01T00:00:00Z') + day * 86_400_000 + 3_333_000;
        const next = nextFireAt('02:30', zone, after);
        expect(next).toBeGreaterThan(after);
        expect(next - after).toBeLessThanOrEqual(49 * 60 * 60 * 1000);
      }
    }
  });

  it('rejects a malformed time or zone rather than guessing', () => {
    expect(() => nextFireAt('7:30', 'UTC', 0)).toThrow(RangeError);
    expect(() => nextFireAt('07:30', 'Nowhere/Land', 0)).toThrow(RangeError);
  });
});

describe('reminderText', () => {
  const forecast = {
    currentC: 26.06,
    maxC: 28.69,
    minC: 23.9,
    chancePct: 10,
    kind: 'clear',
  } as const;

  it('gives the city, temperature and condition, then the range and chance of rain', () => {
    expect(reminderText('Karachi', 'metric', forecast)).toEqual({
      title: 'Karachi · 26° and sunny',
      body: 'High 29°C, low 24°C. 10% chance of rain.',
    });
  });

  it('converts every figure for Fahrenheit', () => {
    expect(reminderText('Karachi', 'imperial', forecast)).toEqual({
      title: 'Karachi · 79° and sunny',
      body: 'High 84°F, low 75°F. 10% chance of rain.',
    });
  });

  it('uses the day’s high when there is no current reading, and omits an unknown chance', () => {
    expect(reminderText('Tokyo', 'metric', { maxC: 18.2, minC: 10.8, kind: 'rain' })).toEqual({
      title: 'Tokyo · 18° and rain',
      body: 'High 18°C, low 11°C.',
    });
  });

  it('leaves the condition out when it is unknown', () => {
    expect(reminderText('Tokyo', 'metric', { maxC: 18, minC: 10, kind: 'unknown' }).title).toBe(
      'Tokyo · 18°',
    );
  });

  it('shows a negative temperature with a real minus sign', () => {
    expect(reminderText('Oslo', 'metric', { maxC: -2, minC: -8.4, kind: 'snow' })).toEqual({
      title: 'Oslo · −2° and snow',
      body: 'High −2°C, low −8°C.',
    });
  });

  it('falls back to a plain reminder when there is no forecast', () => {
    expect(reminderText('Karachi', 'metric')).toEqual({
      title: 'Karachi · your daily weather',
      body: 'Open WeatherBoard for today’s forecast.',
    });
  });
});

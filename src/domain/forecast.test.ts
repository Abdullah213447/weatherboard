import { aggregateDaily, type ForecastSlot } from './forecast';
import type { ConditionKind } from './weather';

const HOUR = 3_600_000;
/** 2026-03-10 00:00 UTC. With a zero offset, local time equals UTC. */
const MIDNIGHT = Date.UTC(2026, 2, 10);

function slot(hoursFromMidnight: number, temperatureC: number, kind: ConditionKind): ForecastSlot {
  const hourOfDay = hoursFromMidnight % 24;
  return {
    time: MIDNIGHT + hoursFromMidnight * HOUR,
    temperatureC,
    condition: { kind, isDay: hourOfDay >= 6 && hourOfDay < 18 },
  };
}

const current = { temperatureC: 10, condition: { kind: 'fog', isDay: false } } as const;

describe('aggregateDaily', () => {
  it('takes the condition from the reading nearest local noon', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        slot(24, 5, 'rain'),
        slot(33, 9, 'cloudy'), // 09:00
        slot(36, 12, 'clear'), // 12:00
        slot(39, 11, 'partly-cloudy'), // 15:00
        slot(45, 6, 'snow'),
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition).toEqual({ kind: 'clear', isDay: true });
  });

  it('prefers the earlier reading when two are equally close to noon', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [slot(24 + 11, 9, 'cloudy'), slot(24 + 13, 12, 'rain')],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('cloudy');
  });

  it('never lets a night reading label a day that has a daytime one', () => {
    const [, tomorrow] = aggregateDaily({
      // 14:00 is further from noon than 11:30 would be, but 03:00 must not win.
      slots: [slot(24 + 3, 2, 'thunderstorm'), slot(24 + 14, 12, 'clear')],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('clear');
  });

  it('marks today partial and folds the current temperature into its range', () => {
    const [today] = aggregateDaily({
      slots: [slot(18, 14, 'clear'), slot(21, 12, 'clear')],
      now: MIDNIGHT + 16 * HOUR,
      utcOffsetSeconds: 0,
      current: { temperatureC: 17, condition: { kind: 'cloudy', isDay: true } },
    });

    expect(today).toMatchObject({ date: '2026-03-10', minC: 12, maxC: 17, partial: true });
  });

  it('uses the current condition for today once the midday readings are gone', () => {
    const [today] = aggregateDaily({
      slots: [slot(18, 14, 'clear'), slot(21, 12, 'clear')],
      now: MIDNIGHT + 16 * HOUR,
      utcOffsetSeconds: 0,
      current: { temperatureC: 17, condition: { kind: 'rain', isDay: true } },
    });

    expect(today?.condition).toEqual({ kind: 'rain', isDay: true });
  });

  it('builds today from the current reading alone when no reading is left today', () => {
    const [today, tomorrow] = aggregateDaily({
      slots: [slot(24, 4, 'clear'), slot(36, 9, 'clear')],
      now: MIDNIGHT + 23.5 * HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(today).toEqual({
      date: '2026-03-10',
      minC: 10,
      maxC: 10,
      condition: { kind: 'fog', isDay: false },
      partial: true,
    });
    expect(tomorrow?.date).toBe('2026-03-11');
  });

  it('groups by the city’s local day, not the UTC day', () => {
    // 22:00 UTC is already tomorrow at UTC+5 and still today at UTC-10.
    const reading = slot(22, 20, 'clear');
    const input = { slots: [reading], now: reading.time, current };

    expect(aggregateDaily({ ...input, utcOffsetSeconds: 5 * 3600 })[0]?.date).toBe('2026-03-11');
    expect(aggregateDaily({ ...input, utcOffsetSeconds: -10 * 3600 })[0]?.date).toBe('2026-03-10');
  });

  it('reports the highest chance of precipitation in the day and omits it when unknown', () => {
    const wet = { ...slot(36, 9, 'rain'), precipitationChancePct: 80 };
    const dry = { ...slot(39, 9, 'cloudy'), precipitationChancePct: 10 };
    const [today, tomorrow] = aggregateDaily({
      slots: [slot(12, 9, 'clear'), wet, dry],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(today).not.toHaveProperty('precipitationChancePct');
    expect(tomorrow?.precipitationChancePct).toBe(80);
  });

  it('stops when the readings run out instead of inventing days', () => {
    const days = aggregateDaily({
      slots: [slot(36, 9, 'clear')],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(days.map((day) => day.date)).toEqual(['2026-03-10', '2026-03-11']);
  });
});

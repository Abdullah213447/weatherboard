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

  it('labels a day by afternoon rain even when noon is only overcast', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [slot(24 + 12, 12, 'cloudy'), { ...slot(24 + 15, 11, 'rain'), precipitationMm: 0.5 }],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition).toEqual({ kind: 'rain', isDay: true });
  });

  it('picks the most severe precipitation of the day', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        { ...slot(24 + 9, 12, 'drizzle'), precipitationMm: 0.6 },
        { ...slot(24 + 12, 12, 'rain'), precipitationMm: 2 },
        { ...slot(24 + 15, 11, 'thunderstorm'), precipitationChancePct: 60 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('thunderstorm');
  });

  it('ignores a passing shower: under 0.5 mm and under a 50% chance', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        slot(24 + 12, 12, 'partly-cloudy'),
        { ...slot(24 + 15, 11, 'rain'), precipitationChancePct: 38, precipitationMm: 0.49 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('partly-cloudy');
  });

  it('counts a small amount when the chance is high', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        slot(24 + 12, 12, 'partly-cloudy'),
        { ...slot(24 + 15, 11, 'rain'), precipitationChancePct: 80, precipitationMm: 0.1 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('rain');
  });

  it('ignores precipitation with no amount and a chance below 50%', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        slot(24 + 12, 12, 'partly-cloudy'),
        { ...slot(24 + 15, 11, 'rain'), precipitationChancePct: 49, precipitationMm: 0 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('partly-cloudy');
  });

  it('counts a chance of exactly 50% as meaningful', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        slot(24 + 12, 12, 'clear'),
        { ...slot(24 + 15, 11, 'snow'), precipitationChancePct: 50 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('snow');
  });

  it('does not let rain outside 06:00-18:00 label the day', () => {
    const [, tomorrow] = aggregateDaily({
      slots: [
        { ...slot(24 + 3, 6, 'rain'), precipitationMm: 5 },
        slot(24 + 12, 12, 'clear'),
        { ...slot(24 + 21, 8, 'thunderstorm'), precipitationMm: 9 },
      ],
      now: MIDNIGHT + HOUR,
      utcOffsetSeconds: 0,
      current,
    });

    expect(tomorrow?.condition.kind).toBe('clear');
  });

  it('describes a too-light shower at noon by its cloud cover, not as rain', () => {
    const shower = (cloudCoverPct?: number) => ({
      ...slot(24 + 12, 12, 'rain'),
      precipitationChancePct: 28,
      precipitationMm: 0.13,
      ...(cloudCoverPct !== undefined && { cloudCoverPct }),
    });
    const label = (cloudCoverPct?: number) =>
      aggregateDaily({
        slots: [shower(cloudCoverPct)],
        now: MIDNIGHT + HOUR,
        utcOffsetSeconds: 0,
        current,
      })[1]?.condition.kind;

    expect(label(5)).toBe('clear');
    expect(label(10)).toBe('clear');
    expect(label(11)).toBe('partly-cloudy');
    expect(label(50)).toBe('partly-cloudy');
    expect(label(51)).toBe('cloudy');
    expect(label(100)).toBe('cloudy');
    // No cloud figure: a shower needs cloud.
    expect(label()).toBe('cloudy');
  });

  it('labels today as rain when it is raining now, whatever the later readings say', () => {
    const [today] = aggregateDaily({
      slots: [slot(12, 14, 'clear'), slot(15, 14, 'clear')],
      now: MIDNIGHT + 10 * HOUR,
      utcOffsetSeconds: 0,
      current: { temperatureC: 12, condition: { kind: 'rain', isDay: true } },
    });

    expect(today?.condition).toEqual({ kind: 'rain', isDay: true });
  });

  it('does not let rain at night right now label the day ahead', () => {
    const [today] = aggregateDaily({
      slots: [slot(12, 14, 'clear')],
      now: MIDNIGHT + 2 * HOUR,
      utcOffsetSeconds: 0,
      current: { temperatureC: 8, condition: { kind: 'rain', isDay: false } },
    });

    expect(today?.condition).toEqual({ kind: 'clear', isDay: true });
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

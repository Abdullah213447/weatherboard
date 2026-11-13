import invalidLatitude from '@fixtures/open-meteo/error-400-invalid-latitude.json';
import honolulu from '@fixtures/open-meteo/forecast-honolulu.json';
import karachi from '@fixtures/open-meteo/forecast-karachi.json';
import tokyo from '@fixtures/open-meteo/forecast-tokyo.json';
import { createOpenMeteoProvider, mapOpenMeteo } from './openMeteo';
import { openMeteoSchema, parseBody } from './schemas';

const map = (body: unknown) => mapOpenMeteo(parseBody(openMeteoSchema, body, 'open-meteo'), 1);

describe('mapOpenMeteo with recorded responses', () => {
  it('maps current conditions for Karachi', () => {
    const weather = map(karachi);

    expect(weather.current).toEqual({
      observedAt: 1794601800000,
      temperatureC: 25.6,
      feelsLikeC: 30.0,
      humidityPct: 86,
      windSpeedMs: 1.93,
      windDirectionDeg: 260,
      condition: { kind: 'clear', isDay: false },
    });
    expect(weather.utcOffsetSeconds).toBe(18000);
    expect(weather.provider).toBe('open-meteo');
  });

  it('reads each day’s local date from the city’s offset', () => {
    const dates = (body: unknown) => map(body).daily.map((day) => day.date);

    expect(dates(karachi)).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(dates(tokyo)[0]).toBe('2026-11-14');
    // Recorded at the same moment, but Honolulu is still on the 13th.
    expect(dates(honolulu)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ]);
  });

  it('translates WMO codes and keeps the provider’s own daily highs and lows', () => {
    const weather = map(karachi);

    // Recorded codes 51, 45, 1, 0, 0.
    expect(weather.daily.map((day) => day.condition.kind)).toEqual([
      'drizzle',
      'fog',
      'clear',
      'clear',
      'clear',
    ]);
    expect(weather.daily[0]).toEqual({
      date: '2026-11-14',
      minC: 23.9,
      maxC: 29.6,
      condition: { kind: 'drizzle', isDay: true },
      precipitationChancePct: 73,
      partial: false,
    });
    // Tokyo recorded 3, 63, 3, 61, 80.
    expect(map(tokyo).daily.map((day) => day.condition.kind)).toEqual([
      'cloudy',
      'rain',
      'cloudy',
      'rain',
      'rain',
    ]);
  });

  it('marks daytime from the is_day flag', () => {
    expect(map(honolulu).current.condition).toEqual({ kind: 'drizzle', isDay: true });
    expect(map(tokyo).current.condition.isDay).toBe(false);
  });
});

describe('createOpenMeteoProvider', () => {
  it('asks for five days in the city’s timezone with wind in m/s', async () => {
    let requested = '';
    const provider = createOpenMeteoProvider({
      now: () => 1,
      fetchJson: (url) => {
        requested = url;
        return Promise.resolve(karachi);
      },
    });

    await provider.fetch({ lat: 24.8607, lon: 67.0011 });

    const params = new URL(requested).searchParams;
    expect(params.get('latitude')).toBe('24.8607');
    expect(params.get('timezone')).toBe('auto');
    expect(params.get('forecast_days')).toBe('5');
    expect(params.get('wind_speed_unit')).toBe('ms');
    expect(params.get('timeformat')).toBe('unixtime');
  });

  it('rejects an error body that arrives with a success status as a bad response', async () => {
    const provider = createOpenMeteoProvider({
      now: () => 1,
      fetchJson: () => Promise.resolve(invalidLatitude),
    });

    await expect(provider.fetch({ lat: 0, lon: 0 })).rejects.toMatchObject({
      kind: 'bad-response',
      source: 'open-meteo',
    });
  });

  it('rejects a forecast shorter than five days', async () => {
    const short = {
      ...karachi,
      daily: { ...karachi.daily, time: karachi.daily.time.slice(0, 3) },
    };
    const provider = createOpenMeteoProvider({
      now: () => 1,
      fetchJson: () => Promise.resolve(short),
    });

    await expect(provider.fetch({ lat: 0, lon: 0 })).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });
});

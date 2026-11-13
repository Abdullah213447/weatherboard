import honoluluCurrent from '@fixtures/openweathermap/current-honolulu.json';
import karachiCurrent from '@fixtures/openweathermap/current-karachi.json';
import tokyoCurrent from '@fixtures/openweathermap/current-tokyo.json';
import honoluluForecast from '@fixtures/openweathermap/forecast-honolulu.json';
import karachiForecast from '@fixtures/openweathermap/forecast-karachi.json';
import tokyoForecast from '@fixtures/openweathermap/forecast-tokyo.json';
import { AppError } from '@/domain/errors';
import { createOpenWeatherMapProvider, mapOpenWeatherMap } from './openWeatherMap';
import { owmCurrentSchema, owmForecastSchema, parseBody } from './schemas';

/** Maps a recorded pair of bodies as if "now" were the moment they were recorded. */
function mapFixture(current: unknown, forecast: unknown) {
  const parsedCurrent = parseBody(owmCurrentSchema, current, 'openweathermap');
  return mapOpenWeatherMap(
    parsedCurrent,
    parseBody(owmForecastSchema, forecast, 'openweathermap'),
    parsedCurrent.dt * 1000,
  );
}

// The three cities were recorded within seconds of each other, at about
// 20:40 UTC on 13 Nov 2026: 01:38 on the 14th in Karachi, 05:40 on the 14th
// in Tokyo, and 10:37 on the 13th in Honolulu.
describe('mapOpenWeatherMap with recorded responses', () => {
  const karachi = mapFixture(karachiCurrent, karachiForecast);
  const tokyo = mapFixture(tokyoCurrent, tokyoForecast);
  const honolulu = mapFixture(honoluluCurrent, honoluluForecast);

  it('puts each city on its own local date at the same instant', () => {
    expect(karachi.daily[0]?.date).toBe('2026-11-14');
    expect(tokyo.daily[0]?.date).toBe('2026-11-14');
    expect(honolulu.daily[0]?.date).toBe('2026-11-13');
  });

  it.each([
    ['Karachi (UTC+5)', karachi, '2026-11-14', '2026-11-18'],
    ['Tokyo (UTC+9)', tokyo, '2026-11-14', '2026-11-18'],
    ['Honolulu (UTC-10)', honolulu, '2026-11-13', '2026-11-17'],
  ])('returns exactly 5 consecutive days for %s', (_name, weather, first, last) => {
    expect(weather.daily).toHaveLength(5);
    expect(weather.daily[0]?.date).toBe(first);
    expect(weather.daily[4]?.date).toBe(last);
  });

  it('flags today as partial and the days after it as complete', () => {
    for (const weather of [karachi, tokyo, honolulu]) {
      expect(weather.daily.map((day) => day.partial)).toEqual([true, false, false, false, false]);
    }
  });

  it('drops the trailing sixth date that has only a few readings', () => {
    // Tokyo's forecast runs into 19 Nov with two readings; Honolulu's into 18 Nov with three.
    expect(tokyo.daily.map((day) => day.date)).not.toContain('2026-11-19');
    expect(honolulu.daily.map((day) => day.date)).not.toContain('2026-11-18');
  });

  it('maps current conditions for Karachi: haze at night', () => {
    expect(karachi.current).toEqual({
      observedAt: 1794602313000,
      temperatureC: 26.06,
      feelsLikeC: 26.06,
      humidityPct: 78,
      windSpeedMs: 1.54,
      windDirectionDeg: 270,
      condition: { kind: 'fog', isDay: false },
    });
    expect(karachi.utcOffsetSeconds).toBe(18000);
    expect(karachi.provider).toBe('openweathermap');
  });

  it('builds Karachi’s today from eight readings plus the current temperature', () => {
    // The hazy 01:38 reading does not label the day: the 11:00 reading (clear) does.
    expect(karachi.daily[0]).toEqual({
      date: '2026-11-14',
      minC: 26.01,
      maxC: 28.69,
      condition: { kind: 'clear', isDay: true },
      precipitationChancePct: 0,
      partial: true,
    });
  });

  it('builds Tokyo’s today from the six readings that are left', () => {
    expect(tokyo.daily[0]).toMatchObject({
      minC: 12.35,
      maxC: 20.49,
      condition: { kind: 'cloudy', isDay: true },
    });
  });

  it('labels a day as rain when rain arrives in the afternoon, even if noon is overcast', () => {
    // 15 Nov in Tokyo: overcast at 12:00, 0.12 mm from 15:00, heavy by evening.
    expect(tokyo.daily[1]).toMatchObject({
      date: '2026-11-15',
      minC: 10.59,
      maxC: 18.4,
      condition: { kind: 'rain', isDay: true },
      precipitationChancePct: 100,
    });
    expect(tokyo.daily.map((day) => day.condition.kind)).toEqual([
      'cloudy',
      'rain',
      'cloudy',
      'rain',
      'rain',
    ]);
  });

  it('keeps Honolulu on the previous calendar day and counts the rain falling now', () => {
    expect(honolulu.current.condition).toEqual({ kind: 'rain', isDay: true });
    expect(honolulu.daily[0]).toEqual({
      date: '2026-11-13',
      minC: 24.26,
      maxC: 25.09,
      condition: { kind: 'rain', isDay: true },
      precipitationChancePct: 24,
      partial: true,
    });
  });

  it('does not call Honolulu\u2019s passing showers rainy days', () => {
    // Trade-wind showers: 0.1-0.3 mm per 3 hours at a 20-38% chance, below both
    // thresholds, so each day keeps its 11:00 reading. Today is rain because it
    // is raining at the time of the reading; 17 Nov because 11:00 itself is a shower.
    expect(honolulu.daily.map((day) => day.condition.kind)).toEqual([
      'rain',
      'clear',
      'partly-cloudy',
      'clear',
      'rain',
    ]);
  });

  it('leaves a dry city on its noon reading', () => {
    // 17 Nov: the 11:00 reading is "few clouds" (801); every other day is clear at 11:00.
    expect(karachi.daily.map((day) => day.condition.kind)).toEqual([
      'clear',
      'clear',
      'clear',
      'partly-cloudy',
      'clear',
    ]);
  });
});

describe('createOpenWeatherMapProvider', () => {
  const coords = { lat: 24.8607, lon: 67.0011 };

  it('requests current and forecast by coordinates in metric units', async () => {
    const urls: string[] = [];
    const provider = createOpenWeatherMapProvider({
      apiKey: 'test-key',
      now: () => karachiCurrent.dt * 1000,
      fetchJson: (url) => {
        urls.push(url);
        return Promise.resolve(url.includes('/forecast?') ? karachiForecast : karachiCurrent);
      },
    });

    const weather = await provider.fetch(coords);

    expect(weather.daily).toHaveLength(5);
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url).toContain('lat=24.8607&lon=67.0011&units=metric&appid=test-key');
    }
  });

  it('reports a body that is missing a required field as a bad response', async () => {
    const withoutTimezone = Object.fromEntries(
      Object.entries(karachiCurrent).filter(([field]) => field !== 'timezone'),
    );
    const provider = createOpenWeatherMapProvider({
      apiKey: 'test-key',
      now: () => 0,
      fetchJson: (url) =>
        Promise.resolve(url.includes('/forecast?') ? karachiForecast : withoutTimezone),
    });

    await expect(provider.fetch(coords)).rejects.toMatchObject({
      kind: 'bad-response',
      source: 'openweathermap',
    });
  });

  it('fails as an auth problem, without a request, when no key is configured', async () => {
    const fetchJson = vi.fn();
    const provider = createOpenWeatherMapProvider({ apiKey: undefined, now: () => 0, fetchJson });

    await expect(provider.fetch(coords)).rejects.toBeInstanceOf(AppError);
    await expect(provider.fetch(coords)).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

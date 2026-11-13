import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import owmCurrentKarachi from '@fixtures/openweathermap/current-karachi.json';
import owmForecastKarachi from '@fixtures/openweathermap/forecast-karachi.json';
import { AppError, type AppErrorKind } from '@/domain/errors';
import type { City } from '@/domain/weather';
import { createCircuitStore } from './circuitStore';
import { CIRCUIT_OPEN_MS } from './fallback';
import { createOpenMeteoProvider } from './openMeteo';
import { createOpenWeatherMapProvider } from './openWeatherMap';
import type { WeatherProvider } from './provider';
import { createWeatherClient } from './weatherClient';

const karachi: City = {
  id: 'test:karachi',
  name: 'Karachi',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 24.8607, lon: 67.0011 },
};

const RECORDED_AT = owmCurrentKarachi.dt * 1000;

/** A real provider fed with recorded bodies, so successes are real snapshots. */
const workingPrimary = createOpenWeatherMapProvider({
  apiKey: 'test-key',
  now: () => RECORDED_AT,
  fetchJson: (url) =>
    Promise.resolve(url.includes('/forecast?') ? owmForecastKarachi : owmCurrentKarachi),
});
const workingFallback = createOpenMeteoProvider({
  now: () => RECORDED_AT,
  fetchJson: () => Promise.resolve(openMeteoKarachi),
});

function failing(id: WeatherProvider['id'], kind: AppErrorKind): WeatherProvider {
  return { id, fetch: vi.fn(() => Promise.reject(new AppError(kind, id))) };
}

function setup(primary: WeatherProvider, fallback: WeatherProvider) {
  const clock = { now: RECORDED_AT };
  const warn = vi.fn();
  const primaryFetch = vi.spyOn(primary, 'fetch');
  const fallbackFetch = vi.spyOn(fallback, 'fetch');
  const client = createWeatherClient({
    primary,
    fallback,
    circuit: createCircuitStore(() => window.sessionStorage),
    now: () => clock.now,
    warn,
  });
  return { client, clock, warn, primaryFetch, fallbackFetch };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('createWeatherClient', () => {
  it('returns the primary provider’s snapshot with the city attached', async () => {
    const { client, fallbackFetch } = setup(workingPrimary, workingFallback);

    const snapshot = await client(karachi);

    expect(snapshot.city).toBe(karachi);
    expect(snapshot.provider).toBe('openweathermap');
    expect(snapshot.daily).toHaveLength(5);
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('falls back to Open-Meteo when OpenWeatherMap sends a body that fails the schema', async () => {
    const forecastWithoutCity = Object.fromEntries(
      Object.entries(owmForecastKarachi).filter(([field]) => field !== 'city'),
    );
    const brokenPrimary = createOpenWeatherMapProvider({
      apiKey: 'test-key',
      now: () => RECORDED_AT,
      fetchJson: (url) =>
        Promise.resolve(url.includes('/forecast?') ? forecastWithoutCity : owmCurrentKarachi),
    });
    const { client } = setup(brokenPrimary, workingFallback);

    const snapshot = await client(karachi);

    expect(snapshot.provider).toBe('open-meteo');
    expect(snapshot.current.temperatureC).toBe(25.6);
  });

  it('does not try the fallback when the device is offline', async () => {
    const { client, fallbackFetch } = setup(failing('openweathermap', 'offline'), workingFallback);

    await expect(client(karachi)).rejects.toMatchObject({ kind: 'offline', source: 'weather' });
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('tries the fallback once when the network fails while the device is online', async () => {
    const { client, fallbackFetch } = setup(failing('openweathermap', 'network'), workingFallback);

    const snapshot = await client(karachi);

    expect(snapshot.provider).toBe('open-meteo');
    expect(fallbackFetch).toHaveBeenCalledTimes(1);
  });

  it('warns the developer, and still serves weather, when the key is rejected', async () => {
    const { client, warn } = setup(failing('openweathermap', 'auth'), workingFallback);

    const snapshot = await client(karachi);

    expect(snapshot.provider).toBe('open-meteo');
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('rejected the API key'));
  });

  it('stops asking OpenWeatherMap for the rest of the session after a rejected key', async () => {
    const { client, clock, warn, primaryFetch } = setup(
      failing('openweathermap', 'auth'),
      workingFallback,
    );

    await client(karachi);
    clock.now += CIRCUIT_OPEN_MS * 100;
    const snapshot = await client(karachi);

    expect(snapshot.provider).toBe('open-meteo');
    expect(primaryFetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reports one "weather is down" error when both providers fail', async () => {
    const { client } = setup(
      failing('openweathermap', 'provider-down'),
      failing('open-meteo', 'timeout'),
    );

    await expect(client(karachi)).rejects.toMatchObject({
      kind: 'provider-down',
      source: 'weather',
    });
  });

  it('keeps the connectivity kind when the fallback also cannot get through', async () => {
    const { client } = setup(
      failing('openweathermap', 'network'),
      failing('open-meteo', 'network'),
    );

    await expect(client(karachi)).rejects.toMatchObject({ kind: 'network', source: 'weather' });
  });

  it('skips OpenWeatherMap after a rate limit, then tries it again after 10 minutes', async () => {
    const primary = failing('openweathermap', 'rate-limited');
    const { client, clock, primaryFetch } = setup(primary, workingFallback);

    await client(karachi);
    expect(primaryFetch).toHaveBeenCalledTimes(1);

    // Still cooling down: the primary is not asked at all.
    clock.now += CIRCUIT_OPEN_MS - 1;
    expect((await client(karachi)).provider).toBe('open-meteo');
    expect(primaryFetch).toHaveBeenCalledTimes(1);

    // Cool-down over: one more attempt.
    clock.now += 1;
    await client(karachi);
    expect(primaryFetch).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit on the second consecutive server failure, not the first', async () => {
    const { client, primaryFetch } = setup(
      failing('openweathermap', 'provider-down'),
      workingFallback,
    );

    await client(karachi);
    await client(karachi);
    expect(primaryFetch).toHaveBeenCalledTimes(2);

    await client(karachi);
    expect(primaryFetch).toHaveBeenCalledTimes(2);
  });

  it('remembers an open circuit across a reload within the session', async () => {
    const first = setup(failing('openweathermap', 'rate-limited'), workingFallback);
    await first.client(karachi);

    // A fresh client, as after a page reload, reading the same sessionStorage.
    const second = setup(workingPrimary, workingFallback);
    const snapshot = await second.client(karachi);

    expect(snapshot.provider).toBe('open-meteo');
    expect(second.primaryFetch).not.toHaveBeenCalled();
  });

  it('passes a cancellation straight through instead of treating it as a failure', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const primary: WeatherProvider = { id: 'openweathermap', fetch: () => Promise.reject(abort) };
    const { client, fallbackFetch } = setup(primary, workingFallback);

    await expect(client(karachi)).rejects.toBe(abort);
    expect(fallbackFetch).not.toHaveBeenCalled();
  });
});

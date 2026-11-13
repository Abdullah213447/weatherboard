import type { CitySearchPage, CitySource } from '@/api/geodb';
import { AppError, type AppErrorKind } from '@/domain/errors';
import { pageFromGeoDb } from '@/test/cities';
import { createCitySearcher } from './citySearcher';

const laho = await pageFromGeoDb('laho');
const lond = await pageFromGeoDb('lond');
const none = await pageFromGeoDb('none');

function setup(primaryImpl: CitySource, options: { minIntervalMs?: number } = {}) {
  const primary = vi.fn(primaryImpl);
  const fallback = vi.fn<CitySource>(() => Promise.resolve({ ...lond, complete: false }));
  const searcher = createCitySearcher({
    primary,
    fallback,
    now: () => Date.now(),
    minIntervalMs: options.minIntervalMs ?? 0,
  });
  return { searcher, primary, fallback };
}

const failing =
  (kind: AppErrorKind): CitySource =>
  () =>
    Promise.reject(new AppError(kind, 'geodb'));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('cache', () => {
  it('answers a repeated query without a second request, ignoring case and spacing', async () => {
    const { searcher, primary } = setup(() => Promise.resolve(laho));

    const first = await searcher.search('Laho');
    const second = await searcher.search('  laho ');

    expect(primary).toHaveBeenCalledTimes(1);
    expect(first.origin).toBe('network');
    expect(second.origin).toBe('cache');
    expect(second.cities).toEqual(first.cities);
  });

  it('filters locally for a longer prefix when the shorter one returned every match', async () => {
    const complete: CitySearchPage = { ...laho, complete: true };
    const { searcher, primary } = setup(() => Promise.resolve(complete));

    await searcher.search('Laho');
    const narrowed = await searcher.search('Lahol');

    expect(primary).toHaveBeenCalledTimes(1);
    expect(narrowed.origin).toBe('local-filter');
    expect(narrowed.cities.map((city) => city.name)).toEqual(['Laholm']);
  });

  it('asks again for a longer prefix when the shorter page was only the top ten', async () => {
    const { searcher, primary } = setup(() => Promise.resolve(laho));

    await searcher.search('Laho');
    await searcher.search('Lahor');

    expect(laho.complete).toBe(false);
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('peek answers from the cache or a local filter, and says null when a request is needed', async () => {
    const complete: CitySearchPage = { ...laho, complete: true };
    const { searcher, primary } = setup(() => Promise.resolve(complete));

    expect(searcher.peek?.('Laho')).toBeNull();
    await searcher.search('Laho');

    expect(searcher.peek?.('laho')).toMatchObject({ origin: 'cache' });
    expect(searcher.peek?.('Lahol')).toMatchObject({ origin: 'local-filter' });
    expect(searcher.peek?.('Lond')).toBeNull();
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it('caches an empty answer too', async () => {
    const { searcher, primary, fallback } = setup(() => Promise.resolve(none));

    const outcome = await searcher.search('Zzqxv');
    await searcher.search('Zzqxv');
    await searcher.search('Zzqxvw');

    expect(outcome.cities).toEqual([]);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe('one request per second', () => {
  it('sends the first request at once and holds the next until a second has passed', async () => {
    const { searcher, primary } = setup(() => Promise.resolve(laho), { minIntervalMs: 1000 });

    await searcher.search('La');
    expect(primary).toHaveBeenCalledTimes(1);

    const second = searcher.search('Lah');
    await vi.advanceTimersByTimeAsync(999);
    expect(primary).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('never sends a query that was cancelled while waiting its turn, so the latest wins', async () => {
    const { searcher, primary } = setup(() => Promise.resolve(laho), { minIntervalMs: 1000 });
    await searcher.search('La');

    const stale = new AbortController();
    const waiting = searcher.search('Lah', stale.signal);
    const assertion = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(300);
    stale.abort();
    await assertion;

    const latest = searcher.search('Laho');
    await vi.advanceTimersByTimeAsync(1000);
    await latest;

    expect(primary.mock.calls.map(([query]) => query)).toEqual(['La', 'Laho']);
  });

  it('does not make cached answers wait', async () => {
    const { searcher } = setup(() => Promise.resolve(laho), { minIntervalMs: 1000 });
    await searcher.search('Laho');

    await expect(searcher.search('Laho')).resolves.toMatchObject({ origin: 'cache' });
  });
});

describe('backup geocoder', () => {
  it.each(['rate-limited', 'provider-down', 'timeout'] as const)(
    'is used when GeoDB fails with %s',
    async (kind) => {
      const { searcher, fallback } = setup(failing(kind));

      const outcome = await searcher.search('Lond');

      expect(fallback).toHaveBeenCalledExactlyOnceWith('Lond', undefined);
      expect(outcome.servedBy).toBe('open-meteo');
      expect(outcome.cities[0]?.name).toBe('London');
    },
  );

  it.each(['auth', 'bad-response', 'offline', 'network', 'not-found'] as const)(
    'is not used when GeoDB fails with %s',
    async (kind) => {
      const { searcher, fallback } = setup(failing(kind));

      await expect(searcher.search('Lond')).rejects.toMatchObject({ kind, source: 'geodb' });
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it('is not used when GeoDB simply finds nothing', async () => {
    const { searcher, fallback } = setup(() => Promise.resolve(none));

    await expect(searcher.search('Zzqxv')).resolves.toMatchObject({
      cities: [],
      servedBy: 'geodb',
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('reports the original GeoDB failure when the backup fails as well', async () => {
    const { searcher, fallback } = setup(failing('rate-limited'));
    fallback.mockRejectedValueOnce(new AppError('timeout', 'open-meteo'));

    await expect(searcher.search('Lond')).rejects.toMatchObject({
      kind: 'rate-limited',
      source: 'geodb',
    });
  });

  it('does not cache backup results, so GeoDB is tried again next time', async () => {
    const { searcher, primary } = setup(failing('rate-limited'));

    await searcher.search('Lond');
    await searcher.search('Lond');

    expect(primary).toHaveBeenCalledTimes(2);
  });
});

import type { CitySearchPage, CitySource } from '@/api/geodb';
import { cleanCities } from '@/domain/cities';
import { AppError, type AppErrorKind } from '@/domain/errors';
import { pageFromGeoDb } from '@/test/cities';
import { createCitySearcher } from './citySearcher';

const laho = await pageFromGeoDb('laho');
const lond = await pageFromGeoDb('lond');
const none = await pageFromGeoDb('none');
const la = await pageFromGeoDb('la');
const lo = await pageFromGeoDb('lo');

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

describe('early request and early matches', () => {
  /** A primary whose requests stay pending until the test settles them. */
  function manualPrimary() {
    const calls: {
      query: string;
      signal: AbortSignal | undefined;
      resolve: (page: CitySearchPage) => void;
      reject: (reason: unknown) => void;
    }[] = [];
    const impl: CitySource = (query, signal) =>
      new Promise<CitySearchPage>((resolve, reject) => {
        calls.push({ query, signal, resolve, reject });
      });
    return { impl, calls };
  }

  it('warm sends a request at once, with nothing that can cancel it', () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });

    expect(searcher.warm?.('La')).toBeInstanceOf(Promise);

    expect(calls.map((call) => call.query)).toEqual(['La']);
    expect(calls[0]?.signal).toBeUndefined();
  });

  it('warm does nothing when the answer is known, already on its way, or inside the spacing window', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });

    void searcher.warm?.('La');
    expect(searcher.warm?.('la ')).toBeNull();
    expect(searcher.warm?.('Lo')).toBeNull();
    calls[0]?.resolve(la);
    await vi.advanceTimersByTimeAsync(1000);
    expect(searcher.warm?.('La')).toBeNull();

    expect(calls).toHaveLength(1);
  });

  it('offers the matches from a shorter page that are certain to lead the full answer', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl);

    expect(searcher.partial?.('Laho')).toBeNull();
    const warmed = searcher.warm?.('La');
    calls[0]?.resolve(la);
    await warmed;

    const early = searcher.partial?.('Laho');
    expect(early?.origin).toBe('cached-prefix');
    // "Lahore Division" and "Lahore District" in the recorded page are one place.
    expect(early?.cities.map((city) => city.name)).toEqual(['Lahore']);
    // The full answer for the same text starts with the same city.
    expect(cleanCities(laho.candidates, 6, 'Laho')[0]).toEqual(early?.cities[0]);
  });

  it('offers London from the recorded "Lo" page, as the city and not as Greater London', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl);
    const warmed = searcher.warm?.('Lo');
    calls[0]?.resolve(lo);
    await warmed;

    expect(searcher.partial?.('Lond')?.cities.map((city) => city.name)).toEqual(['London']);
    expect(cleanCities(lond.candidates, 6, 'Lond')[0]?.id).toBe(
      searcher.partial?.('Lond')?.cities[0]?.id,
    );
  });

  it('never offers a later-word match early, because a larger name match could outrank it', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl);
    const warmed = searcher.warm?.('La');
    calls[0]?.resolve(la);
    await warmed;

    // "Santa Cruz de la Sierra" is in the page and matches "la" on a later word only.
    expect(searcher.partial?.('Sie')).toBeNull();
    expect(searcher.partial?.('Lag')?.cities.map((city) => city.name)).toEqual(['Lagos']);
  });

  it('a search for the text being warmed joins that request and does not send another', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });

    void searcher.warm?.('La');
    const searching = searcher.search('La', new AbortController().signal);
    calls[0]?.resolve(la);

    expect((await searching).cities[0]?.name).toBe('Lahore');
    expect(calls).toHaveLength(1);
  });

  it('abandoning a search that joined a warm request leaves the request running, and it still fills the cache', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });
    const abort = new AbortController();

    void searcher.warm?.('La');
    const searching = searcher.search('La', abort.signal);
    abort.abort();
    await expect(searching).rejects.toMatchObject({ name: 'AbortError' });
    calls[0]?.resolve(la);
    await vi.advanceTimersByTimeAsync(0);

    expect(searcher.peek?.('La')?.origin).toBe('cache');
  });

  it('sends the full-text request the moment the one-second spacing allows, measured from the warm request', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });

    void searcher.warm?.('La');
    await vi.advanceTimersByTimeAsync(400);
    void searcher.search('Lahore');
    await vi.advanceTimersByTimeAsync(599);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(calls.map((call) => call.query)).toEqual(['La', 'Lahore']);
  });

  it('skips the full-text request when the warm page turns out to hold every match', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher } = setup(impl, { minIntervalMs: 1000 });

    void searcher.warm?.('La');
    const searching = searcher.search('Lah');
    calls[0]?.resolve({ ...la, complete: true });
    await vi.advanceTimersByTimeAsync(1000);

    expect((await searching).origin).toBe('local-filter');
    expect(calls).toHaveLength(1);
  });

  it('a warm request that is rate limited sends a joined search to the backup geocoder', async () => {
    const { impl, calls } = manualPrimary();
    const { searcher, fallback } = setup(impl, { minIntervalMs: 1000 });

    void searcher.warm?.('Lo');
    const searching = searcher.search('Lo');
    calls[0]?.reject(new AppError('rate-limited', 'geodb'));

    expect((await searching).servedBy).toBe('open-meteo');
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

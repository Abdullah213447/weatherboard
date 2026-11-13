import { AppError } from '@/domain/errors';
import { cleanCities } from '@/domain/cities';
import { pageFromGeoDb } from '@/test/cities';
import type { CitySearcher, SearchOutcome } from './citySearcher';
import { createSearchController } from './searchController';

const lahoCities = cleanCities((await pageFromGeoDb('laho')).candidates);
const londCities = cleanCities((await pageFromGeoDb('lond')).candidates);

const outcome = (query: string, cities = lahoCities): SearchOutcome => ({
  query,
  cities,
  servedBy: 'geodb',
  origin: 'network',
});

/** A searcher whose every call stays pending until the test settles it. */
function manualSearcher() {
  type Pending = {
    query: string;
    signal: AbortSignal | undefined;
    resolve: (value: SearchOutcome) => void;
    reject: (reason: unknown) => void;
  };
  const calls: Pending[] = [];
  const searcher: CitySearcher = {
    search: (query, signal) =>
      new Promise<SearchOutcome>((resolve, reject) => {
        calls.push({ query, signal, resolve, reject });
      }),
  };
  return { searcher, calls };
}

const call = <T>(list: T[], index: number): T => {
  const item = list[index];
  if (item === undefined) throw new Error(`No search call at index ${String(index)}.`);
  return item;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('waits 150 ms after the last keystroke, then searches once', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('La');
    await vi.advanceTimersByTimeAsync(100);
    controller.setQuery('Lah');
    await vi.advanceTimersByTimeAsync(100);
    controller.setQuery('Laho');
    expect(controller.getState().status).toBe('typing');

    await vi.advanceTimersByTimeAsync(149);
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((entry) => entry.query)).toEqual(['Laho']);
    expect(controller.getState().status).toBe('searching');
  });

  it('stays idle, and sends nothing, below two characters', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('L');
    controller.setQuery('   ');
    await vi.advanceTimersByTimeAsync(1000);

    expect(controller.getState().status).toBe('idle');
    expect(calls).toHaveLength(0);
  });

  it('trims the text before searching', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('  Laho ');
    await vi.advanceTimersByTimeAsync(150);

    expect(call(calls, 0).query).toBe('Laho');
  });
});

describe('searching indicator', () => {
  it('is not shown for a search that finishes within 150 ms', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });
    const seen: boolean[] = [];
    controller.subscribe(() => seen.push(controller.getState().showIndicator));

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150 + 100);
    call(calls, 0).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(500);

    expect(seen).not.toContain(true);
    expect(controller.getState().status).toBe('results');
  });

  it('appears once a search has run for 150 ms, and goes when it finishes', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150 + 149);
    expect(controller.getState().showIndicator).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getState()).toMatchObject({ status: 'searching', showIndicator: true });

    call(calls, 0).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({ status: 'results', showIndicator: false });
  });
});

describe('stale responses', () => {
  it('aborts the previous request when the query changes', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    controller.setQuery('Lond');

    expect(call(calls, 0).signal?.aborted).toBe(true);
  });

  it('ignores an old answer that arrives after a newer one', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    controller.setQuery('Lond');
    await vi.advanceTimersByTimeAsync(150);

    call(calls, 1).resolve(outcome('Lond', londCities));
    await vi.advanceTimersByTimeAsync(0);
    call(calls, 0).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({ status: 'results', query: 'Lond' });
    expect(controller.getState().cities[0]?.name).toBe('London');
  });

  it('ignores an old failure the same way', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    controller.setQuery('Lond');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).reject(new AppError('timeout', 'geodb'));
    call(calls, 1).resolve(outcome('Lond', londCities));
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().status).toBe('results');
  });

  it('keeps the previous suggestions on screen while the next search runs', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(0);

    controller.setQuery('Lahor');
    expect(controller.getState()).toMatchObject({ status: 'typing', cities: lahoCities });
  });
});

describe('outcomes', () => {
  it('reports no results as its own state', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Zzqxv');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).resolve(outcome('Zzqxv', []));
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({
      status: 'no-results',
      query: 'Zzqxv',
      cities: [],
    });
  });

  it('reports a failure with its error and clears the suggestions', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).reject(new AppError('rate-limited', 'geodb', { retryAfterMs: 1000 }));
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({
      status: 'error',
      cities: [],
      error: { kind: 'rate-limited', source: 'geodb' },
    });
  });

  it('records when the last keystroke happened and how the answer was produced', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher, clock: () => 42 });

    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).resolve({ ...outcome('Laho'), origin: 'cache' });
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().timing).toEqual({ inputAt: 42, origin: 'cache' });
  });
});

describe('answers that need no request', () => {
  it('are shown immediately, with no pause and no search call', async () => {
    const { searcher, calls } = manualSearcher();
    searcher.peek = (query) => (query === 'Laho' ? { ...outcome('Laho'), origin: 'cache' } : null);
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');

    expect(controller.getState()).toMatchObject({
      status: 'results',
      query: 'Laho',
      timing: { origin: 'cache' },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(0);
  });

  it('fall back to the normal pause when nothing is known', async () => {
    const { searcher, calls } = manualSearcher();
    searcher.peek = () => null;
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    expect(controller.getState().status).toBe('typing');
    await vi.advanceTimersByTimeAsync(150);

    expect(calls).toHaveLength(1);
  });
});

describe('submit, retry and reset', () => {
  it('submit searches immediately, without the pause', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    const settled = controller.submit('Laho');
    expect(calls).toHaveLength(1);
    call(calls, 0).resolve(outcome('Laho'));

    await expect(settled).resolves.toMatchObject({ status: 'results', query: 'Laho' });
  });

  it('submit reuses an answer already on screen for the same text', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });
    controller.setQuery('Laho');
    await vi.advanceTimersByTimeAsync(150);
    call(calls, 0).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(0);

    await expect(controller.submit('Laho')).resolves.toMatchObject({ status: 'results' });
    expect(calls).toHaveLength(1);
  });

  it('submit after a failure tries again', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });
    const failed = controller.submit('Laho');
    call(calls, 0).reject(new AppError('timeout', 'geodb'));
    await failed;

    void controller.submit('Laho');

    expect(calls).toHaveLength(2);
  });

  it('retry runs the failed query again', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });
    const failed = controller.submit('Laho');
    call(calls, 0).reject(new AppError('provider-down', 'geodb'));
    await failed;

    controller.retry();
    call(calls, 1).resolve(outcome('Laho'));
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().status).toBe('results');
  });

  it('reset cancels a pending search and returns to idle', async () => {
    const { searcher, calls } = manualSearcher();
    const controller = createSearchController({ searcher });

    controller.setQuery('Laho');
    controller.reset();
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(0);
    expect(controller.getState().status).toBe('idle');
  });
});

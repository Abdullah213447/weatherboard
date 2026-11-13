import type { CitySearchPage, CitySource } from '@/api/geodb';
import { cleanCities, matchesPrefix, normalizeName } from '@/domain/cities';
import { isAppError, type AppErrorKind } from '@/domain/errors';
import { MIN_QUERY_LENGTH } from '@/domain/validation';
import type { City } from '@/domain/weather';

export type SearchOutcome = {
  query: string;
  cities: City[];
  /** `open-meteo` when the backup geocoder answered. */
  servedBy: 'geodb' | 'open-meteo';
  /** How the answer was produced, for the latency measurements. */
  origin: 'network' | 'cache' | 'local-filter';
};

export type CitySearcher = {
  search(query: string, signal?: AbortSignal): Promise<SearchOutcome>;
  /**
   * The answer if it can be given without a request (cache or local filter),
   * otherwise null. Lets the field show known results with no delay at all.
   */
  peek?(query: string): SearchOutcome | null;
};

type Deps = {
  primary: CitySource;
  fallback: CitySource;
  now: () => number;
  /** Minimum gap between requests to the primary. GeoDB's free plan allows one per second. */
  minIntervalMs?: number;
  maxResults?: number;
};

/** The primary being unable to answer. An empty result is an answer, not a failure. */
const FALLBACK_ON: ReadonlySet<AppErrorKind> = new Set([
  'rate-limited',
  'provider-down',
  'timeout',
]);

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * City search with the request policy that keeps it inside GeoDB's quota:
 *
 * 1. An answer already fetched this session is reused.
 * 2. If a shorter prefix returned every match there is, a longer one is
 *    answered by filtering that list, with no request.
 * 3. Otherwise a request is made, at most one per second. A query that is
 *    cancelled while waiting its turn never goes out, so the latest wins.
 * 4. If GeoDB is rate limited, down or too slow, the backup geocoder is asked.
 */
export function createCitySearcher({
  primary,
  fallback,
  now,
  minIntervalMs = 1000,
  maxResults = 6,
}: Deps): CitySearcher {
  const cache = new Map<string, CitySearchPage>();
  let lastRequestAt = -Infinity;

  const answer = (
    query: string,
    page: CitySearchPage,
    servedBy: SearchOutcome['servedBy'],
    origin: SearchOutcome['origin'],
  ): SearchOutcome => ({
    query,
    cities: cleanCities(page.candidates, maxResults),
    servedBy,
    origin,
  });

  const withoutRequest = (query: string): SearchOutcome | null => {
    const key = normalizeName(query);
    const exact = cache.get(key);
    if (exact) return answer(query, exact, 'geodb', 'cache');

    for (let length = key.length - 1; length >= MIN_QUERY_LENGTH; length -= 1) {
      const shorter = cache.get(key.slice(0, length));
      if (shorter?.complete) {
        const candidates = shorter.candidates.filter(({ city }) => matchesPrefix(city.name, key));
        return answer(query, { candidates, complete: true }, 'geodb', 'local-filter');
      }
    }
    return null;
  };

  return {
    peek: withoutRequest,

    async search(query, signal) {
      const known = withoutRequest(query);
      if (known) return known;

      const wait = lastRequestAt + minIntervalMs - now();
      if (wait > 0) await abortableSleep(wait, signal);
      lastRequestAt = now();

      try {
        const page = await primary(query, signal);
        cache.set(normalizeName(query), page);
        return answer(query, page, 'geodb', 'network');
      } catch (error) {
        if (!isAppError(error) || !FALLBACK_ON.has(error.kind)) throw error;
        try {
          return answer(query, await fallback(query, signal), 'open-meteo', 'network');
        } catch (fallbackError) {
          // Cancellation passes through; otherwise the first failure explains the situation best.
          throw isAppError(fallbackError) ? error : fallbackError;
        }
      }
    },
  };
}

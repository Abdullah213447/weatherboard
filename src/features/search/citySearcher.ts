import type { CitySearchPage, CitySource } from '@/api/geodb';
import { cleanCities, matchesPrefix, nameStartsWith, normalizeName } from '@/domain/cities';
import { isAppError, type AppErrorKind } from '@/domain/errors';
import { MIN_QUERY_LENGTH } from '@/domain/validation';
import type { City } from '@/domain/weather';

export type SearchOutcome = {
  query: string;
  cities: City[];
  /** `open-meteo` when the backup geocoder answered. */
  servedBy: 'geodb' | 'open-meteo';
  /** How the answer was produced, for the latency measurements. */
  origin: 'network' | 'cache' | 'local-filter' | 'cached-prefix';
};

export type CitySearcher = {
  search(query: string, signal?: AbortSignal): Promise<SearchOutcome>;
  /**
   * The answer if it can be given without a request (cache or local filter),
   * otherwise null. Lets the field show known results with no delay at all.
   */
  peek?(query: string): SearchOutcome | null;
  /**
   * Matches that are certain to lead the full answer, taken from an earlier,
   * shorter search whose page was not complete. Null when there are none.
   * They can be shown at once while the request for the full text runs.
   */
  partial?(query: string): SearchOutcome | null;
  /**
   * Starts a request for `query` that nothing cancels, so its page reaches the
   * cache even if the user types on. Resolves once it has settled either way;
   * null when no request was started (already known, already running, or too
   * soon after the last one).
   */
  warm?(query: string): Promise<void> | null;
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
 *
 * Two additions make the first answer arrive sooner. `warm` sends a request
 * that is never cancelled, used for the first two letters. `partial` then
 * answers a longer text from that page straight away: the page holds the
 * largest places for its prefix, so any of them whose name starts with the
 * longer text are exactly the top of that text's own answer.
 */
export function createCitySearcher({
  primary,
  fallback,
  now,
  minIntervalMs = 1000,
  maxResults = 6,
}: Deps): CitySearcher {
  const cache = new Map<string, CitySearchPage>();
  /** Requests started by `warm`, by normalized query. A search for the same text joins one. */
  const warming = new Map<string, Promise<CitySearchPage>>();
  let lastRequestAt = -Infinity;

  const answer = (
    query: string,
    page: CitySearchPage,
    servedBy: SearchOutcome['servedBy'],
    origin: SearchOutcome['origin'],
  ): SearchOutcome => ({
    query,
    cities: cleanCities(page.candidates, maxResults, query),
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

  const partial = (query: string): SearchOutcome | null => {
    const key = normalizeName(query);
    for (let length = key.length - 1; length >= MIN_QUERY_LENGTH; length -= 1) {
      const shorter = cache.get(key.slice(0, length));
      if (!shorter) continue;
      const candidates = shorter.candidates.filter(({ city }) => matchesPrefix(city.name, key));
      const cities = cleanCities(candidates, maxResults, query).filter((city) =>
        nameStartsWith(city.name, key),
      );
      if (cities.length > 0) return { query, cities, servedBy: 'geodb', origin: 'cached-prefix' };
    }
    return null;
  };

  /** Rejects when `signal` aborts, leaving the underlying request to finish on its own. */
  const abandonable = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const abort = () => {
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject);
    });

  return {
    peek: withoutRequest,
    partial,

    warm(query) {
      const key = normalizeName(query);
      if (withoutRequest(query) || warming.has(key)) return null;
      // Never jump the queue: a request inside the spacing window would be refused.
      if (lastRequestAt + minIntervalMs - now() > 0) return null;
      lastRequestAt = now();
      const request = primary(query).then((page) => {
        cache.set(key, page);
        return page;
      });
      warming.set(key, request);
      const settled = request.then(
        () => undefined,
        () => undefined,
      );
      void settled.then(() => warming.delete(key));
      return settled;
    },

    async search(query, signal) {
      const known = withoutRequest(query);
      if (known) return known;

      const key = normalizeName(query);
      let request = warming.get(key);
      if (!request) {
        const wait = lastRequestAt + minIntervalMs - now();
        if (wait > 0) {
          await abortableSleep(wait, signal);
          // A warm request may have landed during the wait and made this one unnecessary.
          const nowKnown = withoutRequest(query);
          if (nowKnown) return nowKnown;
        }
        lastRequestAt = now();
        request = primary(query, signal).then((page) => {
          cache.set(key, page);
          return page;
        });
      }

      try {
        return answer(query, await abandonable(request, signal), 'geodb', 'network');
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

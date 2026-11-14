import { AppError, isAppError } from '@/domain/errors';
import { MIN_QUERY_LENGTH } from '@/domain/validation';
import type { City } from '@/domain/weather';
import type { CitySearcher, SearchOutcome } from './citySearcher';

export type SearchStatus = 'idle' | 'typing' | 'searching' | 'results' | 'no-results' | 'error';

export type SearchState = {
  status: SearchStatus;
  /** The text the current status refers to. */
  query: string;
  /** Suggestions to show. Kept from the previous answer while a new one is on its way. */
  cities: City[];
  servedBy: SearchOutcome['servedBy'] | null;
  /** True once a search has been running long enough to deserve a spinner. */
  showIndicator: boolean;
  error: AppError | null;
  /** For the dev-only latency mark: when the last keystroke happened and how it was answered. */
  timing: { inputAt: number; origin: SearchOutcome['origin'] } | null;
};

/** The input length at which the first request is sent without waiting for a pause. See PLAN §9. */
const EARLY_REQUEST_LENGTH = MIN_QUERY_LENGTH;

const IDLE: SearchState = {
  status: 'idle',
  query: '',
  cities: [],
  servedBy: null,
  showIndicator: false,
  error: null,
  timing: null,
};

function settledFrom(outcome: SearchOutcome, inputAt: number): SearchState {
  return {
    status: outcome.cities.length > 0 ? 'results' : 'no-results',
    query: outcome.query,
    cities: outcome.cities,
    servedBy: outcome.servedBy,
    showIndicator: false,
    error: null,
    timing: { inputAt, origin: outcome.origin },
  };
}

/** Shown first and never moved: what the network adds goes underneath. */
function mergeBeneath(shown: readonly City[], arrived: readonly City[], limit: number): City[] {
  const ids = new Set(shown.map((city) => city.id));
  return [...shown, ...arrived.filter((city) => !ids.has(city.id))].slice(0, limit);
}

/** How many suggestions a merged list may hold; the searcher's own answers are already capped at this. */
const MAX_SUGGESTIONS = 6;

type Deps = {
  searcher: CitySearcher;
  /** Pause after the last keystroke before searching. */
  debounceMs?: number;
  /** A search faster than this never shows a spinner, which avoids flicker. */
  indicatorDelayMs?: number;
  clock?: () => number;
};

export type SearchController = {
  getState: () => SearchState;
  subscribe: (listener: () => void) => () => void;
  /** Call on every change to the input. */
  setQuery: (text: string) => void;
  /** Searches now, skipping the pause, and resolves with the settled state. */
  submit: (text: string) => Promise<SearchState>;
  /** Runs the last query again, for a "Try again" button. */
  retry: () => void;
  /** Back to idle, cancelling anything in flight. */
  reset: () => void;
};

/**
 * The search field's state machine, free of React so its timing can be
 * tested exactly: idle -> typing -> searching -> results | no-results | error.
 */
export function createSearchController({
  searcher,
  debounceMs = 150,
  indicatorDelayMs = 150,
  clock = () => performance.now(),
}: Deps): SearchController {
  let state = IDLE;
  const listeners = new Set<() => void>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let indicatorTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;
  let inputAt = 0;
  /** Early matches on screen for a text whose full answer is still on its way. */
  let early: { query: string; cities: City[] } | null = null;

  const set = (next: SearchState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const cancel = () => {
    clearTimeout(debounceTimer);
    clearTimeout(indicatorTimer);
    inFlight?.abort();
    inFlight = undefined;
  };

  const run = async (query: string): Promise<SearchState> => {
    cancel();
    const controller = new AbortController();
    inFlight = controller;
    set({ ...state, status: 'searching', query, showIndicator: false, error: null });
    indicatorTimer = setTimeout(() => {
      if (inFlight === controller) set({ ...state, showIndicator: true });
    }, indicatorDelayMs);

    try {
      const outcome = await searcher.search(query, controller.signal);
      if (controller.signal.aborted) return state;
      const shown = early?.query === query ? early.cities : [];
      early = null;
      set(
        settledFrom(
          shown.length > 0
            ? { ...outcome, cities: mergeBeneath(shown, outcome.cities, MAX_SUGGESTIONS) }
            : outcome,
          inputAt,
        ),
      );
    } catch (error) {
      // A newer query replaced this one: its result is the one that matters.
      if (controller.signal.aborted) return state;
      if (early?.query === query) {
        // The early matches are real answers; they stay, and the list is simply not extended.
        const shown = early.cities;
        early = null;
        set(
          settledFrom(
            { query, cities: shown, servedBy: 'geodb', origin: 'cached-prefix' },
            inputAt,
          ),
        );
        return state;
      }
      set({
        ...IDLE,
        status: 'error',
        query,
        error: isAppError(error) ? error : new AppError('bad-response', 'geodb', { cause: error }),
      });
    } finally {
      if (inFlight === controller) {
        clearTimeout(indicatorTimer);
        inFlight = undefined;
      }
    }
    return state;
  };

  /** Puts matches from an earlier, shorter search on screen for `query`. False if there are none. */
  const showEarly = (query: string): boolean => {
    const partial = searcher.partial?.(query);
    if (!partial) return false;
    early = { query, cities: partial.cities };
    set({
      ...state,
      status: state.status === 'searching' ? 'searching' : 'typing',
      query,
      cities: partial.cities,
      servedBy: partial.servedBy,
      error: null,
      timing: { inputAt, origin: partial.origin },
    });
    return true;
  };

  /** A warm request has landed: answer the current text from it, fully or in part. */
  const onWarmed = () => {
    if (state.status !== 'typing' && state.status !== 'searching') return;
    const { query } = state;
    const known = searcher.peek?.(query);
    if (known) {
      cancel();
      early = null;
      set(settledFrom(known, inputAt));
      return;
    }
    if (early?.query !== query) showEarly(query);
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setQuery(text) {
      const query = text.trim();
      inputAt = clock();
      cancel();
      early = null;
      if (query.length < MIN_QUERY_LENGTH) {
        set(IDLE);
        return;
      }
      // An answer that needs no request is shown at once: the pause exists to
      // spare the API, and there is nothing to spare here.
      const known = searcher.peek?.(query);
      if (known) {
        set(settledFrom(known, inputAt));
        return;
      }
      if (!showEarly(query)) {
        set({ ...state, status: 'typing', query, showIndicator: false, error: null });
      }
      // The first request goes out at the second letter without waiting for a
      // pause, and nothing cancels it: by the time the user stops typing its
      // page is usually in, and the list can be filled from it.
      if (query.length === EARLY_REQUEST_LENGTH) {
        void searcher.warm?.(query)?.then(() => {
          onWarmed();
        });
      }
      debounceTimer = setTimeout(() => {
        void run(query);
      }, debounceMs);
    },

    submit(text) {
      const query = text.trim();
      // An error is not a settled answer: submitting again is how the user retries.
      const settled = state.query === query && ['results', 'no-results'].includes(state.status);
      if (settled) return Promise.resolve(state);
      inputAt = clock();
      return run(query);
    },

    retry() {
      if (state.query.length >= MIN_QUERY_LENGTH) void run(state.query);
    },

    reset() {
      cancel();
      early = null;
      set(IDLE);
    },
  };
}

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
      set(settledFrom(outcome, inputAt));
    } catch (error) {
      // A newer query replaced this one: its result is the one that matters.
      if (controller.signal.aborted) return state;
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
      set({ ...state, status: 'typing', query, showIndicator: false, error: null });
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
      set(IDLE);
    },
  };
}

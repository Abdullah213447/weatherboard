import type { SearchState } from './searchController';

export const SUGGESTION_MEASURE = 'wb:suggestions';

/**
 * Development-only measurement of the autocomplete budget: time from the
 * last keystroke until the suggestions are painted. Read the results with
 * `performance.getEntriesByName('wb:suggestions')`; each entry's `detail`
 * says whether it was answered from the network, the cache or a local filter.
 * The call site is guarded by `import.meta.env.DEV`, so none of this ships.
 */
export function markSuggestionsPainted(timing: NonNullable<SearchState['timing']>): void {
  // Two frames: the first runs before the paint that shows the list, the second after it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.measure(SUGGESTION_MEASURE, {
        start: timing.inputAt,
        end: performance.now(),
        detail: { origin: timing.origin },
      });
    });
  });
}

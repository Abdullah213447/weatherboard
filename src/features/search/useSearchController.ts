import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CitySearcher } from './citySearcher';
import {
  createSearchController,
  type SearchController,
  type SearchState,
} from './searchController';

/** Binds a search controller to a component's lifetime and re-renders on every state change. */
export function useSearchController(searcher: CitySearcher): [SearchState, SearchController] {
  const [controller] = useState(() => createSearchController({ searcher }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  // Leaving the page with a request in flight must not update anything afterwards.
  useEffect(
    () => () => {
      controller.reset();
    },
    [controller],
  );

  return [state, controller];
}

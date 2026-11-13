import { useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept up to date. For the rare case where a
 * breakpoint changes what is rendered rather than how it looks. `fallback`
 * is used where matchMedia does not exist.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return () => {
        media.removeEventListener('change', listener);
      };
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
  );
}

import { QueryClient } from '@tanstack/react-query';

/**
 * Retries and stale times are set per query, next to the reasoning for them.
 * The global default is "no surprises": nothing retries or refetches unless a
 * query asks for it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // networkMode 'always': by default a query pauses while the browser says it
      // is offline and never reports back. Ours must run and fail, because that
      // failure is what switches the app to the saved snapshot.
      queries: { retry: false, refetchOnWindowFocus: false, networkMode: 'always' },
    },
  });
}

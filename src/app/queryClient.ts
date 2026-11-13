import { QueryClient } from '@tanstack/react-query';

/**
 * Retries and stale times are set per query, next to the reasoning for them.
 * The global default is "no surprises": nothing retries or refetches unless a
 * query asks for it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
}

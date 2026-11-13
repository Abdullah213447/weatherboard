import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { weatherClient, type WeatherClient } from '@/api/weather';
import { AppError, isAppError, isRetryable } from '@/domain/errors';
import type { City, WeatherSnapshot } from '@/domain/weather';
import { offlineStore, type OfflineStore } from '@/lib/offlineStore';

/** OpenWeatherMap refreshes no faster than this, so asking sooner is wasted quota. */
export const WEATHER_STALE_MS = 10 * 60 * 1000;
const MAX_RETRIES = 1;

export type WeatherState =
  /** No city chosen yet. */
  | { status: 'idle' }
  | { status: 'loading' }
  /** Fresh data. `isRefreshing` is true while a newer copy is on its way. */
  | { status: 'success'; snapshot: WeatherSnapshot; isRefreshing: boolean }
  /**
   * The request failed. `saved` holds the last snapshot of this same city if
   * there is one, so the screen can show it with its age instead of nothing.
   */
  | { status: 'error'; error: AppError; saved: WeatherSnapshot | null; retry: () => void };

type Deps = { client: WeatherClient; store: OfflineStore };
const defaultDeps: Deps = { client: weatherClient, store: offlineStore };

function toAppError(error: unknown): AppError {
  return isAppError(error) ? error : new AppError('bad-response', 'weather', { cause: error });
}

/**
 * Weather for a city, keyed by its coordinates.
 *
 * - Cached for 10 minutes; switching back to a recent city costs no request.
 * - Retried once, and only for failures that a second attempt could fix.
 * - For the city on screen, every success is saved for offline use; on
 *   failure the saved copy is offered back if it is for the same city.
 */
type Options = {
  /**
   * Whether this is the city on screen: its weather is saved for offline use
   * and read back when a request fails. False for secondary uses such as the
   * favourites list, which must not overwrite the last viewed city's copy.
   */
  offline?: boolean;
};

export function useWeather(
  city: City | null,
  deps: Deps = defaultDeps,
  { offline = true }: Options = {},
): WeatherState {
  const { client, store } = deps;

  const live = useQuery({
    queryKey: ['weather', city?.coords.lat, city?.coords.lon],
    enabled: city !== null,
    staleTime: WEATHER_STALE_MS,
    retry: (failureCount, error) =>
      failureCount < MAX_RETRIES && isRetryable(toAppError(error).kind),
    queryFn: async ({ signal }) => {
      if (!city) throw new Error('useWeather: queryFn ran without a city.');
      return client(city, signal);
    },
  });

  // Saved from here, not from the query function: several components can share
  // one query, and only the one showing the city on screen should save it.
  const fresh = live.data;
  useEffect(() => {
    if (offline && fresh) void store.write(fresh);
  }, [offline, fresh, store]);

  const saved = useQuery({
    queryKey: ['weather-saved', city?.id],
    enabled: offline && city !== null && live.isError,
    staleTime: Infinity,
    queryFn: async () => {
      const snapshot = await store.read();
      return snapshot && snapshot.city.id === city?.id ? snapshot : null;
    },
  });

  if (city === null) return { status: 'idle' };
  if (live.isSuccess) {
    return { status: 'success', snapshot: live.data, isRefreshing: live.isFetching };
  }
  if (live.isError && !saved.isLoading) {
    return {
      status: 'error',
      error: toAppError(live.error),
      // A failed refresh keeps the data it was refreshing; prefer that over the stored copy.
      saved: live.data ?? saved.data ?? null,
      retry: () => {
        void live.refetch();
      },
    };
  }
  return { status: 'loading' };
}

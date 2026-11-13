import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { mapOpenMeteo } from '@/api/weather/openMeteo';
import { openMeteoSchema, parseBody } from '@/api/weather/schemas';
import type { WeatherClient } from '@/api/weather/weatherClient';
import { createQueryClient } from '@/app/queryClient';
import { AppError } from '@/domain/errors';
import type { City, WeatherSnapshot } from '@/domain/weather';
import type { OfflineStore } from '@/lib/offlineStore';
import { useWeather } from './useWeather';

const karachi: City = {
  id: 'test:karachi',
  name: 'Karachi',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 24.8607, lon: 67.0011 },
};
const lahore: City = {
  ...karachi,
  id: 'test:lahore',
  name: 'Lahore',
  coords: { lat: 31.5, lon: 74.3 },
};

const snapshot: WeatherSnapshot = {
  city: karachi,
  ...mapOpenMeteo(parseBody(openMeteoSchema, openMeteoKarachi, 'open-meteo'), 1794601800000),
};

function memoryStore(
  initial: WeatherSnapshot | null = null,
): OfflineStore & { saved: WeatherSnapshot | null } {
  const store = {
    saved: initial,
    write: (next: WeatherSnapshot) => {
      store.saved = next;
      return Promise.resolve();
    },
    read: () => Promise.resolve(store.saved),
  };
  return store;
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

describe('useWeather', () => {
  it('is idle, and makes no request, until a city is chosen', () => {
    const client = vi.fn<WeatherClient>();
    const { result } = renderHook(() => useWeather(null, { client, store: memoryStore() }), {
      wrapper,
    });

    expect(result.current).toEqual({ status: 'idle' });
    expect(client).not.toHaveBeenCalled();
  });

  it('loads, then returns the snapshot and saves it for offline use', async () => {
    const store = memoryStore();
    const client = vi.fn<WeatherClient>(() => Promise.resolve(snapshot));
    const { result } = renderHook(() => useWeather(karachi, { client, store }), { wrapper });

    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current).toMatchObject({ status: 'success', snapshot });
    expect(store.saved).toEqual(snapshot);
  });

  it('retries once after a failure that a retry can fix', async () => {
    const client = vi
      .fn<WeatherClient>()
      .mockRejectedValueOnce(new AppError('timeout', 'weather'))
      .mockResolvedValueOnce(snapshot);
    const { result } = renderHook(() => useWeather(karachi, { client, store: memoryStore() }), {
      wrapper,
    });

    await waitFor(
      () => {
        expect(result.current.status).toBe('success');
      },
      { timeout: 3000 },
    );
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that a retry cannot fix', async () => {
    const client = vi.fn<WeatherClient>(() => Promise.reject(new AppError('offline', 'weather')));
    const { result } = renderHook(() => useWeather(karachi, { client, store: memoryStore() }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(client).toHaveBeenCalledTimes(1);
  });

  it('offers the saved snapshot alongside the error when it is for the same city', async () => {
    const client = vi.fn<WeatherClient>(() => Promise.reject(new AppError('offline', 'weather')));
    const { result } = renderHook(
      () => useWeather(karachi, { client, store: memoryStore(snapshot) }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current).toMatchObject({
      status: 'error',
      error: { kind: 'offline', source: 'weather' },
      saved: snapshot,
    });
  });

  it('does not show another city’s saved weather', async () => {
    const client = vi.fn<WeatherClient>(() => Promise.reject(new AppError('offline', 'weather')));
    const { result } = renderHook(
      () => useWeather(lahore, { client, store: memoryStore(snapshot) }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current).toMatchObject({ status: 'error', saved: null });
  });
});

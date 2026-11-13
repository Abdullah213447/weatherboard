import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import { mapOpenMeteo } from '@/api/weather/openMeteo';
import { openMeteoSchema, parseBody } from '@/api/weather/schemas';
import type { WeatherSnapshot } from '@/domain/weather';
import { createOfflineStore } from './offlineStore';

/** The smallest stand-in for Cache Storage: one named cache holding responses by URL. */
function fakeCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    put: (url: string, response: Response) => {
      entries.set(url, response);
      return Promise.resolve();
    },
    match: (url: string) => Promise.resolve(entries.get(url)?.clone()),
  };
  return {
    entries,
    storage: { open: () => Promise.resolve(cache) } as unknown as CacheStorage,
  };
}

const snapshot: WeatherSnapshot = {
  city: {
    id: 'test:karachi',
    name: 'Karachi',
    country: 'Pakistan',
    countryCode: 'PK',
    coords: { lat: 24.8607, lon: 67.0011 },
  },
  ...mapOpenMeteo(parseBody(openMeteoSchema, openMeteoKarachi, 'open-meteo'), 1794601800000),
};

describe('createOfflineStore', () => {
  it('reads back exactly the snapshot that was written', async () => {
    const { storage } = fakeCaches();
    const store = createOfflineStore(() => storage);

    await store.write(snapshot);

    await expect(store.read()).resolves.toEqual(snapshot);
  });

  it('keeps only the most recent snapshot', async () => {
    const { storage, entries } = fakeCaches();
    const store = createOfflineStore(() => storage);

    await store.write(snapshot);
    await store.write({ ...snapshot, fetchedAt: 2 });

    expect(entries.size).toBe(1);
    expect((await store.read())?.fetchedAt).toBe(2);
  });

  it('returns null when nothing has been saved', async () => {
    const store = createOfflineStore(() => fakeCaches().storage);

    await expect(store.read()).resolves.toBeNull();
  });

  it('ignores a stored entry that no longer matches the snapshot shape', async () => {
    const { storage, entries } = fakeCaches();
    const store = createOfflineStore(() => storage);
    await store.write(snapshot);
    const [url] = [...entries.keys()];
    entries.set(url ?? '', new Response(JSON.stringify({ city: 'Karachi' })));

    await expect(store.read()).resolves.toBeNull();
  });

  it('does nothing, without throwing, when Cache Storage is unavailable or failing', async () => {
    const missing = createOfflineStore(() => undefined);
    const failing = createOfflineStore(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    await expect(missing.write(snapshot)).resolves.toBeUndefined();
    await expect(missing.read()).resolves.toBeNull();
    await expect(failing.write(snapshot)).resolves.toBeUndefined();
    await expect(failing.read()).resolves.toBeNull();
  });
});

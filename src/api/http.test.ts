import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import owm400 from '@fixtures/openweathermap/error-400-invalid-coordinates.json';
import owm401 from '@fixtures/openweathermap/error-401-invalid-key.json';
import owm404 from '@fixtures/openweathermap/error-404-city-not-found.json';
import geodb429 from '@fixtures/geodb/rate-limited-429.json';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { createFetchJson } from './http';

const URL = 'https://api.example.test/data';

const online = createFetchJson({
  fetch: (input, init) => fetch(input, init),
  isOnline: () => true,
});
const offline = createFetchJson({
  fetch: (input, init) => fetch(input, init),
  isOnline: () => false,
});

describe('fetchJson', () => {
  it('returns the parsed body on success', async () => {
    server.use(http.get(URL, () => HttpResponse.json(openMeteoKarachi)));

    await expect(online(URL, { source: 'open-meteo' })).resolves.toEqual(openMeteoKarachi);
  });

  // Bodies are the ones the real services returned for these statuses.
  it.each([
    [401, owm401, 'auth'],
    [404, owm404, 'not-found'],
    [400, owm400, 'bad-response'],
    [429, geodb429, 'rate-limited'],
  ] as const)('maps HTTP %d to %s', async (status, body, kind) => {
    server.use(http.get(URL, () => HttpResponse.json(body, { status })));

    await expect(online(URL, { source: 'openweathermap' })).rejects.toMatchObject({
      name: 'AppError',
      kind,
      source: 'openweathermap',
    });
  });

  it.each([500, 502, 503])('maps HTTP %d to provider-down', async (status) => {
    server.use(http.get(URL, () => new HttpResponse(null, { status })));

    await expect(online(URL, { source: 'geodb' })).rejects.toMatchObject({ kind: 'provider-down' });
  });

  it('reads how long to wait from Retry-After on a rate limit', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json(geodb429, { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );

    await expect(online(URL, { source: 'geodb' })).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfterMs: 30_000,
    });
  });

  it('reports a success status with a body that is not JSON as a bad response', async () => {
    server.use(http.get(URL, () => HttpResponse.text('<html>Gateway</html>')));

    await expect(online(URL, { source: 'open-meteo' })).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  it('reports "network" when the request fails while the device is online', async () => {
    server.use(http.get(URL, () => HttpResponse.error()));

    await expect(online(URL, { source: 'openweathermap' })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('reports "offline" for the same failure when the device has no connection', async () => {
    server.use(http.get(URL, () => HttpResponse.error()));

    await expect(offline(URL, { source: 'openweathermap' })).rejects.toMatchObject({
      kind: 'offline',
    });
  });

  it('gives up with a timeout when no answer arrives in time', async () => {
    server.use(
      http.get(URL, async () => {
        await delay(500);
        return HttpResponse.json(openMeteoKarachi);
      }),
    );

    await expect(online(URL, { source: 'open-meteo', timeoutMs: 20 })).rejects.toMatchObject({
      kind: 'timeout',
      source: 'open-meteo',
    });
  });

  it('rethrows the abort, not an AppError, when the caller cancels', async () => {
    server.use(
      http.get(URL, async () => {
        await delay(500);
        return HttpResponse.json(openMeteoKarachi);
      }),
    );
    const controller = new AbortController();

    const request = online(URL, { source: 'geodb', signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not send a request when the signal is already aborted', async () => {
    let requests = 0;
    server.use(
      http.get(URL, () => {
        requests += 1;
        return HttpResponse.json(openMeteoKarachi);
      }),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(online(URL, { source: 'geodb', signal: controller.signal })).rejects.toMatchObject(
      {
        name: 'AbortError',
      },
    );
    expect(requests).toBe(0);
  });
});

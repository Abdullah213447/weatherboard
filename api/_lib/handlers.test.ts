import { handleDispatch, handleSubscribe, handleTest, handleUnsubscribe } from './handlers.js';
import { MAX_BODY_BYTES } from './http.js';
import { createMemoryStore } from './memoryStore.js';
import { subscriptionId, type PushPayload } from './reminders.js';

const SITE = 'https://weatherboard.example';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const NOW = Date.parse('2026-11-14T02:00:00Z');

const validBody = {
  subscription: { endpoint: ENDPOINT, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } },
  time: '07:30',
  timeZone: 'Asia/Karachi',
  city: { id: 'PK:24.86,67.00', name: 'Karachi', lat: 24.8607, lon: 67.0011 },
  unit: 'metric',
};

function setup() {
  const memory = createMemoryStore();
  const sent: PushPayload[] = [];
  const deps = {
    store: memory.store,
    send: vi.fn((_subscription: unknown, payload: PushPayload) => {
      sent.push(payload);
      return Promise.resolve('sent' as const);
    }),
    fetchForecast: vi.fn(() =>
      Promise.resolve({ currentC: 26, maxC: 29, minC: 24, chancePct: 10, kind: 'clear' as const }),
    ),
    now: () => NOW,
  };
  return { memory, deps, sent };
}

function request(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = { origin: SITE },
): Request {
  return new Request(`${SITE}${path}`, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'weatherboard.example', ...headers },
  });
}

const read = async (response: Response) => ({
  status: response.status,
  body: (await response.json()) as Record<string, unknown>,
});

describe('subscribe', () => {
  it('stores a valid subscription and answers with the next fire time only', async () => {
    const { deps, memory } = setup();

    const result = await read(
      await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps),
    );

    expect(result).toEqual({
      status: 201,
      body: { ok: true, nextFireAt: Date.parse('2026-11-14T02:30:00Z') },
    });
    expect(memory.has(subscriptionId(ENDPOINT))).toBe(true);
    // Nothing about the subscription is echoed back.
    expect(JSON.stringify(result.body)).not.toContain('fcm.googleapis.com');
  });

  it('answers 200 for an update', async () => {
    const { deps } = setup();
    await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps);

    const again = await handleSubscribe(
      request('/api/push/subscribe', 'POST', { ...validBody, time: '08:00' }),
      deps,
    );

    expect(again.status).toBe(200);
  });

  it('refuses a request from another site', async () => {
    const { deps, memory } = setup();

    const other = await read(
      await handleSubscribe(
        request('/api/push/subscribe', 'POST', validBody, { origin: 'https://evil.example' }),
        deps,
      ),
    );
    const none = await handleSubscribe(request('/api/push/subscribe', 'POST', validBody, {}), deps);

    expect(other.status).toBe(403);
    expect(other.body.error).toBe('forbidden_origin');
    expect(none.status).toBe(403);
    expect(memory.scheduled()).toEqual([]);
  });

  it('says which fields are wrong in a bad body', async () => {
    const { deps } = setup();

    const result = await read(
      await handleSubscribe(
        request('/api/push/subscribe', 'POST', { ...validBody, time: '25:99', unit: 'kelvin' }),
        deps,
      ),
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid_body');
    expect(result.body.message).toBe(
      'The request is missing a field or has one in the wrong form.',
    );
    expect(result.body.fields).toEqual(
      expect.arrayContaining([expect.stringMatching(/^time: /), expect.stringMatching(/^unit: /)]),
    );
  });

  it('refuses an endpoint that is not a known push service, with its own clear message', async () => {
    const { deps, memory } = setup();
    const body = {
      ...validBody,
      subscription: { ...validBody.subscription, endpoint: 'https://example.com/collect' },
    };

    const result = await read(
      await handleSubscribe(request('/api/push/subscribe', 'POST', body), deps),
    );

    expect(result).toEqual({
      status: 400,
      body: {
        error: 'endpoint_not_allowed',
        message:
          'The push address is not from a browser push service this app recognises, so it was not stored.',
      },
    });
    expect(memory.scheduled()).toEqual([]);
  });

  it('refuses text that is not JSON', async () => {
    const { deps } = setup();

    const result = await handleSubscribe(request('/api/push/subscribe', 'POST', '{not json'), deps);

    expect(result.status).toBe(400);
  });

  it('refuses a body over the size cap without parsing it', async () => {
    const { deps } = setup();
    const huge = { ...validBody, padding: 'x'.repeat(MAX_BODY_BYTES) };

    const result = await read(
      await handleSubscribe(request('/api/push/subscribe', 'POST', huge), deps),
    );

    expect(result.status).toBe(413);
    expect(result.body.error).toBe('body_too_large');
  });

  it('rate-limits one address', async () => {
    const { deps } = setup();
    const from = { origin: SITE, 'x-forwarded-for': '203.0.113.9' };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const response = await handleSubscribe(
        request('/api/push/subscribe', 'POST', validBody, from),
        deps,
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 30).every((status) => status < 300)).toBe(true);
    expect(statuses.slice(30)).toEqual([429, 429]);
    // Someone else is unaffected.
    const other = await handleSubscribe(
      request('/api/push/subscribe', 'POST', validBody, {
        origin: SITE,
        'x-forwarded-for': '198.51.100.7',
      }),
      deps,
    );
    expect(other.status).toBe(200);
  });
});

describe('unsubscribe', () => {
  it('removes the record and its schedule entry', async () => {
    const { deps, memory } = setup();
    await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps);

    const result = await handleUnsubscribe(
      request('/api/push/subscribe', 'DELETE', { endpoint: ENDPOINT }),
      deps,
    );

    expect(result.status).toBe(200);
    expect(memory.has(subscriptionId(ENDPOINT))).toBe(false);
    expect(memory.scheduled()).toEqual([]);
  });

  it('gives the same answer for a subscription that never existed', async () => {
    const { deps } = setup();

    const result = await read(
      await handleUnsubscribe(
        request('/api/push/subscribe', 'DELETE', { endpoint: ENDPOINT }),
        deps,
      ),
    );

    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it('is same-origin only', async () => {
    const { deps } = setup();

    const result = await handleUnsubscribe(
      request(
        '/api/push/subscribe',
        'DELETE',
        { endpoint: ENDPOINT },
        { origin: 'https://evil.example' },
      ),
      deps,
    );

    expect(result.status).toBe(403);
  });
});

describe('test send', () => {
  it('answers at once and sends, after the delay, through the same path as a real reminder', async () => {
    const { deps, sent } = setup();
    await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps);
    let background: Promise<unknown> = Promise.resolve();

    const result = await read(
      await handleTest(
        request('/api/push/test', 'POST', { endpoint: ENDPOINT }),
        deps,
        (work) => {
          background = work;
        },
        20,
      ),
    );

    expect(result.status).toBe(202);
    expect(sent).toHaveLength(0);
    await background;
    expect(sent).toEqual([
      expect.objectContaining({ title: 'Karachi · 26° and sunny', tag: 'wb-daily' }),
    ]);
  });

  it('refuses to send to a subscription that is not stored', async () => {
    const { deps, sent } = setup();
    const background = vi.fn();

    const result = await read(
      await handleTest(
        request('/api/push/test', 'POST', { endpoint: ENDPOINT }),
        deps,
        background,
        0,
      ),
    );

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('not_subscribed');
    expect(background).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('is same-origin only', async () => {
    const { deps } = setup();

    const result = await handleTest(
      request('/api/push/test', 'POST', { endpoint: ENDPOINT }, {}),
      deps,
      vi.fn(),
      0,
    );

    expect(result.status).toBe(403);
  });
});

describe('dispatch', () => {
  const signedBy = (expected: string) => (signature: string) =>
    Promise.resolve(signature === expected);

  it('rejects a call with no signature', async () => {
    const { deps } = setup();

    const result = await read(
      await handleDispatch(request('/api/push/dispatch', 'POST', {}, {}), deps, signedBy('good')),
    );

    expect(result.status).toBe(401);
    expect(result.body.error).toBe('invalid_signature');
  });

  it('rejects a call with the wrong signature, and sends nothing', async () => {
    const { deps, sent } = setup();
    await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps);
    deps.now = () => Date.parse('2026-11-14T02:31:00Z');

    const result = await handleDispatch(
      request('/api/push/dispatch', 'POST', {}, { 'upstash-signature': 'forged' }),
      deps,
      signedBy('good'),
    );

    expect(result.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('verifies against the body exactly as it was sent', async () => {
    const { deps } = setup();
    const verify = vi.fn(() => Promise.resolve(true));
    const raw = '{ "spacing":   "kept" }';

    await handleDispatch(
      request('/api/push/dispatch', 'POST', raw, { 'upstash-signature': 'sig' }),
      deps,
      verify,
    );

    expect(verify).toHaveBeenCalledExactlyOnceWith('sig', raw);
  });

  it('with a valid signature, sends what is due and answers with counts only', async () => {
    const { deps, sent } = setup();
    await handleSubscribe(request('/api/push/subscribe', 'POST', validBody), deps);
    deps.now = () => Date.parse('2026-11-14T02:31:00Z');

    const result = await read(
      await handleDispatch(
        request('/api/push/dispatch', 'POST', {}, { 'upstash-signature': 'good' }),
        deps,
        signedBy('good'),
      ),
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, due: 1, sent: 1, skippedLate: 0, alreadyClaimed: 0, removed: 0, failed: 0 },
    });
    expect(sent).toHaveLength(1);
  });
});

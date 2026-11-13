import { isAllowedPushEndpoint } from './allowlist.js';
import type { FetchForecast } from './forecast.js';
import { createMemoryStore } from './memoryStore.js';
import {
  dispatchDue,
  MAX_LATENESS_MS,
  saveReminder,
  subscriptionId,
  type PushPayload,
  type SendResult,
} from './reminders.js';
import { subscribeBody, type SubscribeBody } from './schemas.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** 02:00Z on 14 Nov 2026: 07:00 in Karachi, half an hour before a 07:30 reminder. */
const START = Date.parse('2026-11-14T02:00:00Z');
const DUE = Date.parse('2026-11-14T02:30:00Z');

const endpointFor = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

function body(name: string, overrides: Partial<SubscribeBody> = {}): SubscribeBody {
  return {
    subscription: {
      endpoint: endpointFor(name),
      keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
    },
    time: '07:30',
    timeZone: 'Asia/Karachi',
    city: { id: 'PK:24.86,67.00', name: 'Karachi', lat: 24.8607, lon: 67.0011 },
    unit: 'metric',
    ...overrides,
  };
}

function setup() {
  const memory = createMemoryStore();
  const clock = { now: START };
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const results = new Map<string, SendResult>();
  const send = vi.fn((subscription: { endpoint: string }, payload: PushPayload) => {
    sent.push({ endpoint: subscription.endpoint, payload });
    return Promise.resolve(results.get(subscription.endpoint) ?? 'sent');
  });
  const fetchForecast = vi.fn<FetchForecast>(() =>
    Promise.resolve({ currentC: 26, maxC: 29, minC: 24, chancePct: 10, kind: 'clear' }),
  );
  const deps = { store: memory.store, send, fetchForecast, now: () => clock.now };
  const subscribe = (name: string, overrides?: Partial<SubscribeBody>) =>
    saveReminder(deps, body(name, overrides));
  return { memory, clock, sent, results, send, fetchForecast, deps, subscribe };
}

describe('endpoint allowlist', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://fcm.googleapis.com/wp/abc123',
    'https://jmt17.google.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGuQ0abc',
    'https://wns2-by3p.notify.windows.com/w/?token=abc',
  ])('accepts %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['an arbitrary host', 'https://example.com/push'],
    ['an internal address', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/push'],
    ['a lookalike suffix', 'https://evilpush.apple.com.attacker.net/x'],
    ['a host that merely ends with the suffix text', 'https://notpush.apple.com/x'],
    ['the bare suffix domain', 'https://push.apple.com.evil.org/x'],
    ['credentials in the address', 'https://user:pass@fcm.googleapis.com/fcm/send/abc'],
    ['a non-default port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['not a URL', 'fcm.googleapis.com/fcm/send/abc'],
    ['an empty string', ''],
  ])('rejects %s', (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe('subscribe body', () => {
  it('accepts a complete, valid body', () => {
    expect(subscribeBody.safeParse(body('a')).success).toBe(true);
  });

  it.each([
    ['a time that is not HH:mm', { time: '7:30' }],
    ['an impossible time', { time: '24:00' }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['an unknown unit', { unit: 'kelvin' }],
    ['a latitude off the globe', { city: { id: 'x', name: 'X', lat: 91, lon: 0 } }],
    ['a city with no name', { city: { id: 'x', name: '', lat: 0, lon: 0 } }],
    ['an over-long city name', { city: { id: 'x', name: 'N'.repeat(81), lat: 0, lon: 0 } }],
    ['a subscription with no keys', { subscription: { endpoint: endpointFor('a') } }],
    [
      'keys that are not base64url',
      {
        subscription: {
          endpoint: endpointFor('a'),
          keys: { p256dh: 'has spaces!'.repeat(5), auth: 'a'.repeat(22) },
        },
      },
    ],
    [
      'an endpoint off the allowlist',
      {
        subscription: {
          endpoint: 'https://example.com/p',
          keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
        },
      },
    ],
    ['a "replaces" address off the allowlist', { replaces: 'https://example.com/old' }],
  ])('rejects %s', (_label, change) => {
    expect(subscribeBody.safeParse({ ...body('a'), ...change }).success).toBe(false);
  });

  it('rejects a body with a field missing', () => {
    const withoutUnit = Object.fromEntries(
      Object.entries(body('a')).filter(([field]) => field !== 'unit'),
    );
    expect(subscribeBody.safeParse(withoutUnit).success).toBe(false);
    expect(subscribeBody.safeParse(null).success).toBe(false);
  });
});

describe('saveReminder', () => {
  it('stores the record under a hash of the endpoint and schedules its next fire time', async () => {
    const { subscribe, memory } = setup();

    const result = await subscribe('a');

    const id = subscriptionId(endpointFor('a'));
    expect(result).toEqual({ outcome: 'created', nextFireAt: DUE });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(memory.scheduledFor(id)).toBe(DUE);
  });

  it('updates in place when the same browser subscribes again, with the new time', async () => {
    const { subscribe, memory } = setup();
    await subscribe('a');

    const result = await subscribe('a', { time: '09:15' });

    expect(result.outcome).toBe('updated');
    expect(memory.scheduled()).toHaveLength(1);
    expect(memory.scheduledFor(subscriptionId(endpointFor('a')))).toBe(
      Date.parse('2026-11-14T04:15:00Z'),
    );
  });

  it('removes the address a rotated subscription replaces', async () => {
    const { subscribe, memory } = setup();
    await subscribe('old');

    await subscribe('new', { replaces: endpointFor('old') });

    expect(memory.has(subscriptionId(endpointFor('old')))).toBe(false);
    expect(memory.has(subscriptionId(endpointFor('new')))).toBe(true);
  });

  it('refuses a new subscription at the cap, but still lets an existing one update', async () => {
    const memory = createMemoryStore(2);
    const deps = { store: memory.store, now: () => START };
    await saveReminder(deps, body('a'));
    await saveReminder(deps, body('b'));

    expect((await saveReminder(deps, body('c'))).outcome).toBe('full');
    expect((await saveReminder(deps, body('a', { time: '08:00' }))).outcome).toBe('updated');
    expect(memory.scheduled()).toHaveLength(2);
  });
});

describe('dispatchDue', () => {
  it('sends nothing before the time and sends once it is due', async () => {
    const { subscribe, clock, deps, sent } = setup();
    await subscribe('a');

    clock.now = DUE - 1;
    expect(await dispatchDue(deps)).toMatchObject({ due: 0, sent: 0 });

    clock.now = DUE + 2 * MINUTE;
    expect(await dispatchDue(deps)).toEqual({
      due: 1,
      sent: 1,
      skippedLate: 0,
      alreadyClaimed: 0,
      removed: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toEqual({
      v: 1,
      title: 'Karachi · 26° and sunny',
      body: 'High 29°C, low 24°C. 10% chance of rain.',
      url: '/?city=Karachi~~PK~24.8607~67.0011',
      tag: 'wb-daily',
    });
  });

  it('moves a sent reminder to the same time tomorrow, so the next run does not send it again', async () => {
    const { subscribe, clock, deps, sent, memory } = setup();
    await subscribe('a');
    clock.now = DUE + MINUTE;
    await dispatchDue(deps);

    expect(memory.scheduledFor(subscriptionId(endpointFor('a')))).toBe(DUE + 24 * HOUR);
    clock.now += 5 * MINUTE;
    expect(await dispatchDue(deps)).toMatchObject({ due: 0, sent: 0 });
    expect(sent).toHaveLength(1);

    clock.now = DUE + 24 * HOUR + MINUTE;
    expect(await dispatchDue(deps)).toMatchObject({ due: 1, sent: 1 });
    expect(sent).toHaveLength(2);
  });

  it('two overlapping runs send once', async () => {
    const { subscribe, clock, deps, sent } = setup();
    await subscribe('a');
    await subscribe('b');
    clock.now = DUE + MINUTE;

    const [first, second] = await Promise.all([dispatchDue(deps), dispatchDue(deps)]);

    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((message) => message.endpoint)).size).toBe(2);
    expect(first.sent + second.sent).toBe(2);
    expect(first.alreadyClaimed + second.alreadyClaimed).toBe(2);
  });

  it('skips a reminder more than 60 minutes late, but reschedules it', async () => {
    const { subscribe, clock, deps, sent, memory } = setup();
    await subscribe('a');
    clock.now = DUE + MAX_LATENESS_MS + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ due: 1, sent: 0, skippedLate: 1 });
    expect(sent).toHaveLength(0);
    expect(memory.scheduledFor(subscriptionId(endpointFor('a')))).toBe(DUE + 24 * HOUR);
  });

  it('still sends at exactly 60 minutes late', async () => {
    const { subscribe, clock, deps } = setup();
    await subscribe('a');
    clock.now = DUE + MAX_LATENESS_MS;

    expect(await dispatchDue(deps)).toMatchObject({ sent: 1, skippedLate: 0 });
  });

  it('removes a subscription the push service reports as gone', async () => {
    const { subscribe, clock, deps, results, memory } = setup();
    await subscribe('gone');
    await subscribe('fine');
    results.set(endpointFor('gone'), 'gone');
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ due: 2, sent: 1, removed: 1 });
    expect(memory.has(subscriptionId(endpointFor('gone')))).toBe(false);
    expect(memory.scheduled()).toEqual([subscriptionId(endpointFor('fine'))]);
  });

  it('keeps a subscription whose send failed for another reason, for tomorrow', async () => {
    const { subscribe, clock, deps, results, memory } = setup();
    await subscribe('a');
    results.set(endpointFor('a'), 'failed');
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    expect(memory.has(subscriptionId(endpointFor('a')))).toBe(true);
  });

  it('drops a schedule entry whose record has expired', async () => {
    const { subscribe, clock, deps, memory, sent } = setup();
    await subscribe('a');
    memory.expireRecord(subscriptionId(endpointFor('a')));
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ due: 1, sent: 0, removed: 1 });
    expect(memory.scheduled()).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('still sends a plain reminder when the forecast cannot be fetched', async () => {
    const { subscribe, clock, deps, fetchForecast, sent } = setup();
    fetchForecast.mockRejectedValue(new Error('Open-Meteo answered 503'));
    await subscribe('a');
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ sent: 1, failed: 0 });
    expect(sent[0]?.payload).toMatchObject({
      title: 'Karachi · your daily weather',
      body: 'Open WeatherBoard for today’s forecast.',
    });
  });

  it('fetches the forecast once per distinct city, however many follow it', async () => {
    const { subscribe, clock, deps, fetchForecast } = setup();
    await subscribe('a');
    await subscribe('b');
    await subscribe('c', {
      city: { id: 'JP:35.68,139.65', name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
      timeZone: 'Asia/Karachi',
    });
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps)).toMatchObject({ sent: 3 });
    expect(fetchForecast).toHaveBeenCalledTimes(2);
  });

  it('writes the notification in the subscriber’s own unit', async () => {
    const { subscribe, clock, deps, sent } = setup();
    await subscribe('f', { unit: 'imperial' });
    clock.now = DUE + MINUTE;
    await dispatchDue(deps);

    expect(sent[0]?.payload).toMatchObject({
      title: 'Karachi · 79° and sunny',
      body: 'High 84°F, low 75°F. 10% chance of rain.',
    });
  });

  it('handles no more than the cap in one run and leaves the rest due', async () => {
    const { subscribe, clock, deps } = setup();
    for (const name of ['a', 'b', 'c', 'd', 'e']) await subscribe(name);
    clock.now = DUE + MINUTE;

    expect(await dispatchDue(deps, 3)).toMatchObject({ due: 3, sent: 3 });
    expect(await dispatchDue(deps, 3)).toMatchObject({ due: 2, sent: 2 });
  });

  it('fires each zone at its own local time', async () => {
    const { subscribe, clock, deps, sent } = setup();
    await subscribe('karachi');
    await subscribe('tokyo', { timeZone: 'Asia/Tokyo' }); // 07:30 JST is 22:30Z

    clock.now = DUE + MINUTE;
    await dispatchDue(deps);
    expect(sent.map((message) => message.endpoint)).toEqual([endpointFor('karachi')]);

    clock.now = Date.parse('2026-11-14T22:31:00Z');
    await dispatchDue(deps);
    expect(sent.map((message) => message.endpoint)).toEqual([
      endpointFor('karachi'),
      endpointFor('tokyo'),
    ]);
  });
});

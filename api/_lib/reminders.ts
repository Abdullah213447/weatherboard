import { createHash } from 'node:crypto';
import { encodeCityParam } from '../../src/domain/cities.js';
import { reminderText } from '../../src/domain/reminderText.js';
import { nextFireAt } from '../../src/domain/reminderTime.js';
import type { FetchForecast } from './forecast.js';
import type { ReminderRecord, SubscribeBody } from './schemas.js';
import type { ReminderStore } from './store.js';

/** A reminder this late is no longer a morning reminder; it is skipped, not delivered stale. */
export const MAX_LATENESS_MS = 60 * 60 * 1000;
/** How many due reminders one run handles. The rest are still due at the next run. */
export const MAX_PER_RUN = 200;
/** Replaces an undelivered reminder instead of stacking a second one. */
export const TOPIC = 'wb-daily';
export const TTL_SECONDS = 60 * 60;

/** What the service worker receives. Kept small: push payloads are limited to about 4 KB. */
export type PushPayload = { v: 1; title: string; body: string; url: string; tag: string };

export type SendResult = 'sent' | 'gone' | 'failed';
export type SendPush = (
  subscription: ReminderRecord['subscription'],
  payload: PushPayload,
) => Promise<SendResult>;

export type Deps = {
  store: ReminderStore;
  send: SendPush;
  fetchForecast: FetchForecast;
  now: () => number;
};

/** The subscription's id: a hash, so the push address itself is never used as a key or logged. */
export function subscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export async function saveReminder(
  { store, now }: Pick<Deps, 'store' | 'now'>,
  body: SubscribeBody,
): Promise<{ outcome: 'created' | 'updated' | 'full'; nextFireAt: number }> {
  const { replaces, ...rest } = body;
  const record: ReminderRecord = { ...rest, id: subscriptionId(body.subscription.endpoint) };
  const next = nextFireAt(record.time, record.timeZone, now());
  const outcome = await store.put(record, next);
  // The browser rotated the subscription: the old address is dead weight.
  if (outcome !== 'full' && replaces && replaces !== body.subscription.endpoint) {
    await store.remove(subscriptionId(replaces));
  }
  return { outcome, nextFireAt: next };
}

function payloadFor(
  record: ReminderRecord,
  forecast: Awaited<ReturnType<FetchForecast>> | undefined,
): PushPayload {
  const { city, unit } = record;
  const cityParam = encodeCityParam({
    id: city.id,
    name: city.name,
    country: '',
    // The id starts with the country code ("PK:24.86,67.00").
    countryCode: city.id.slice(0, 2),
    coords: { lat: city.lat, lon: city.lon },
  });
  return {
    v: 1,
    ...reminderText(city.name, unit, forecast),
    url: `/?city=${encodeURIComponent(cityParam)}`,
    tag: TOPIC,
  };
}

/** Sends one reminder now. A forecast that cannot be fetched still produces a plain reminder. */
export async function sendReminder(
  { send, fetchForecast }: Pick<Deps, 'send' | 'fetchForecast'>,
  record: ReminderRecord,
  forecasts = new Map<string, Promise<Awaited<ReturnType<FetchForecast>> | undefined>>(),
): Promise<SendResult> {
  // One request per distinct city in a run, however many people follow it.
  let forecast = forecasts.get(record.city.id);
  if (!forecast) {
    forecast = fetchForecast(record.city).catch(() => undefined);
    forecasts.set(record.city.id, forecast);
  }
  return send(record.subscription, payloadFor(record, await forecast));
}

export type DispatchCounts = {
  due: number;
  sent: number;
  /** Too late to be useful; rescheduled for the next day without sending. */
  skippedLate: number;
  /** Another run got there first. */
  alreadyClaimed: number;
  /** The push service said the subscription is gone, or its record had expired. */
  removed: number;
  failed: number;
};

/**
 * Sends every reminder that is due.
 *
 * For each due id: move it to its next occurrence first, and only the run
 * that made the move sends. So a retried or overlapping run cannot send
 * twice, and a crash after the move costs one reminder rather than
 * duplicating one.
 */
export async function dispatchDue(deps: Deps, limit = MAX_PER_RUN): Promise<DispatchCounts> {
  const { store, now } = deps;
  const startedAt = now();
  const due = await store.due(startedAt, limit);
  const counts: DispatchCounts = {
    due: due.length,
    sent: 0,
    skippedLate: 0,
    alreadyClaimed: 0,
    removed: 0,
    failed: 0,
  };
  const forecasts = new Map<string, Promise<Awaited<ReturnType<FetchForecast>> | undefined>>();

  await Promise.all(
    due.map(async ({ id, scheduledFor }) => {
      const record = await store.get(id);
      if (!record) {
        // The record expired after 90 days unopened; drop its schedule entry too.
        await store.remove(id);
        counts.removed += 1;
        return;
      }

      const claimed = await store.claim(id, nextFireAt(record.time, record.timeZone, startedAt));
      if (!claimed) {
        counts.alreadyClaimed += 1;
        return;
      }
      if (startedAt - scheduledFor > MAX_LATENESS_MS) {
        counts.skippedLate += 1;
        return;
      }

      const result = await sendReminder(deps, record, forecasts);
      if (result === 'sent') counts.sent += 1;
      else if (result === 'gone') {
        await store.remove(id);
        counts.removed += 1;
      } else counts.failed += 1;
    }),
  );

  return counts;
}

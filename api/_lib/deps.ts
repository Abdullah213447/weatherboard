import { Receiver } from '@upstash/qstash';
import { Redis } from '@upstash/redis';
import { createForecastFetcher } from './forecast.js';
import type { Deps } from './reminders.js';
import { createPushSender } from './sender.js';
import { createRedisStore } from './store.js';

function required(name: string): string {
  const value = process.env[name];
  // The name is safe to report; the value never is.
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Everything the endpoints need, built from the environment on first use. */
export function createDeps(): Deps {
  return {
    store: createRedisStore(
      new Redis({
        url: required('UPSTASH_REDIS_REST_URL'),
        token: required('UPSTASH_REDIS_REST_TOKEN'),
      }),
    ),
    send: createPushSender({
      subject: required('VAPID_SUBJECT'),
      publicKey: required('VITE_VAPID_PUBLIC_KEY'),
      privateKey: required('VAPID_PRIVATE_KEY'),
    }),
    fetchForecast: createForecastFetcher(fetch),
    now: () => Date.now(),
  };
}

export type VerifySignature = (signature: string, rawBody: string) => Promise<boolean>;

/** Checks that a request really came from our QStash schedule. */
export function createSignatureVerifier(): VerifySignature {
  const receiver = new Receiver({
    currentSigningKey: required('QSTASH_CURRENT_SIGNING_KEY'),
    nextSigningKey: required('QSTASH_NEXT_SIGNING_KEY'),
  });
  return async (signature, rawBody) => {
    try {
      return await receiver.verify({ signature, body: rawBody });
    } catch {
      return false;
    }
  };
}

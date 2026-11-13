import { AppError, type AppErrorKind } from '@/domain/errors';

/** What the server stores for a reminder, besides the browser's push address. */
export type ReminderSettings = {
  /** HH:mm, in the user's own time zone. */
  time: string;
  timeZone: string;
  city: { id: string; name: string; lat: number; lon: number };
  unit: 'metric' | 'imperial';
};

export type PushSubscriptionData = { endpoint: string; keys: { p256dh: string; auth: string } };

export type ReminderApi = {
  /** Creates or updates. Resolves only when the server has confirmed it. */
  save(
    settings: ReminderSettings,
    subscription: PushSubscriptionData,
  ): Promise<{ nextFireAt: number }>;
  remove(endpoint: string): Promise<void>;
  /** Asks for one real notification in about ten seconds. */
  test(endpoint: string): Promise<void>;
};

function kindFor(status: number): AppErrorKind {
  if (status === 429) return 'rate-limited';
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'provider-down';
  return 'bad-response';
}

async function call(path: string, method: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
    throw new AppError(timedOut ? 'timeout' : navigator.onLine ? 'network' : 'offline', 'push', {
      cause,
    });
  }
  if (!response.ok) {
    throw new AppError(kindFor(response.status), 'push', {
      detail: `HTTP ${String(response.status)}`,
    });
  }
  return response.json().catch(() => ({}));
}

export const reminderApi: ReminderApi = {
  async save(settings, subscription) {
    const answer = (await call('/api/push/subscribe', 'POST', { ...settings, subscription })) as {
      nextFireAt?: unknown;
    };
    if (typeof answer.nextFireAt !== 'number') {
      throw new AppError('bad-response', 'push', { detail: 'no nextFireAt in the answer' });
    }
    return { nextFireAt: answer.nextFireAt };
  },
  async remove(endpoint) {
    await call('/api/push/subscribe', 'DELETE', { endpoint });
  },
  async test(endpoint) {
    await call('/api/push/test', 'POST', { endpoint });
  },
};

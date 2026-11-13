import type { PushSubscriptionData, ReminderSettings } from './reminderApi';
import type { ReminderEnv } from './reminderController';

export const karachiSettings: ReminderSettings = {
  time: '07:30',
  timeZone: 'Asia/Karachi',
  city: { id: 'PK:24.86,67.00', name: 'Karachi', lat: 24.8607, lon: 67.0011 },
  unit: 'metric',
};

export const subscription: PushSubscriptionData = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
};

type World = {
  support: ReturnType<ReminderEnv['support']>;
  permission: NotificationPermission;
  /** What the browser's prompt will answer. */
  promptAnswer: NotificationPermission;
  subscription: PushSubscriptionData | null;
  stored: ReminderSettings | null;
  timeZone: string;
};

/**
 * A browser the tests control: what it supports, what the user allows, and
 * whether a push subscription exists. Every call is recorded in order.
 */
export function createTestEnv(initial: Partial<World> = {}) {
  const world: World = {
    support: 'supported',
    permission: 'default',
    promptAnswer: 'granted',
    subscription: null,
    stored: null,
    timeZone: 'Asia/Karachi',
    ...initial,
  };
  const calls: string[] = [];
  const shared: (ReminderSettings | null)[] = [];
  const api = {
    save: vi.fn((settings: ReminderSettings) => {
      calls.push('api.save');
      return Promise.resolve({ nextFireAt: 0, settings });
    }),
    remove: vi.fn(() => {
      calls.push('api.remove');
      return Promise.resolve();
    }),
    test: vi.fn(() => {
      calls.push('api.test');
      return Promise.resolve();
    }),
  };
  const requestPermission = vi.fn(() => {
    calls.push('requestPermission');
    world.permission = world.promptAnswer;
    return Promise.resolve(world.promptAnswer);
  });

  const env: ReminderEnv = {
    support: () => world.support,
    permission: () => world.permission,
    requestPermission,
    getSubscription: () => {
      calls.push('getSubscription');
      return Promise.resolve(world.subscription);
    },
    subscribe: () => {
      calls.push('subscribe');
      world.subscription = subscription;
      return Promise.resolve(subscription);
    },
    unsubscribe: () => {
      calls.push('unsubscribe');
      world.subscription = null;
      return Promise.resolve();
    },
    api,
    load: () => world.stored,
    store: (settings) => {
      world.stored = settings;
    },
    shareWithWorker: (settings) => {
      shared.push(settings);
      return Promise.resolve();
    },
    timeZone: () => world.timeZone,
  };
  return { env, world, calls, api, requestPermission, shared };
}

import { AppError, isAppError } from '@/domain/errors';
import type { PushSubscriptionData, ReminderApi, ReminderSettings } from './reminderApi';

/**
 * The reminder's state machine, free of React and of browser globals, so
 * every path can be tested: what the browser supports, what the user has
 * permitted, and what the server has confirmed.
 *
 * One rule runs through it: the card says "on" only when the server has
 * confirmed the reminder. A subscription the browser made but the server did
 * not store is not a reminder.
 */

export type ReminderStatus =
  /** Not looked yet. */
  | 'checking'
  /** This browser cannot receive web push at all. */
  | 'unsupported'
  /** An iPhone or iPad where the app is not on the Home Screen, which iOS requires. */
  | 'ios-install'
  | 'off'
  | 'on'
  /** The user, or a policy, has denied notifications for this site. */
  | 'blocked';

export type ReminderState = {
  status: ReminderStatus;
  /** What the server last confirmed. Present exactly when status is "on". */
  settings: ReminderSettings | null;
  /** A request is in flight; controls should wait. */
  busy: boolean;
  /** The last save, removal or test failed, and why. */
  error: AppError | null;
  /** Something the user should know that is not a failure. */
  note: 'turned-off-elsewhere' | 'test-sent' | null;
};

export type ReminderEnv = {
  support: () => 'supported' | 'unsupported' | 'ios-install';
  permission: () => NotificationPermission;
  /** Shows the browser's permission prompt. Must be called from a user gesture. */
  requestPermission: () => Promise<NotificationPermission>;
  getSubscription: () => Promise<PushSubscriptionData | null>;
  subscribe: () => Promise<PushSubscriptionData>;
  unsubscribe: () => Promise<void>;
  api: ReminderApi;
  /** The confirmed settings, remembered so "on" survives a reload. */
  load: () => ReminderSettings | null;
  store: (settings: ReminderSettings | null) => void;
  /** Leaves the settings where the service worker can read them if the subscription rotates. */
  shareWithWorker: (settings: ReminderSettings | null) => Promise<void>;
  timeZone: () => string;
};

export type ReminderController = {
  getState: () => ReminderState;
  subscribe: (listener: () => void) => () => void;
  /**
   * On app open: brings the card in line with reality, and renews the
   * server's copy. `current` carries what may have changed since last time.
   */
  reconcile: (current: { unit: ReminderSettings['unit'] }) => Promise<void>;
  /**
   * Turns the reminder on. Call it directly from the click that follows our
   * explainer: the browser's permission prompt is requested first, before any
   * other waiting, because Safari only allows it during a user gesture.
   */
  enable: (settings: Omit<ReminderSettings, 'timeZone'>) => Promise<void>;
  update: (settings: Omit<ReminderSettings, 'timeZone'>) => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<void>;
  /** The page has regained focus: the user may have changed the permission in site settings. */
  recheckPermission: () => void;
  dismissNote: () => void;
};

const toError = (error: unknown): AppError =>
  isAppError(error) ? error : new AppError('bad-response', 'push', { cause: error });

export function createReminderController(env: ReminderEnv): ReminderController {
  let state: ReminderState = {
    status: 'checking',
    settings: null,
    busy: false,
    error: null,
    note: null,
  };
  const listeners = new Set<() => void>();
  const set = (next: Partial<ReminderState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const forget = async () => {
    env.store(null);
    await env.shareWithWorker(null);
  };
  const remember = async (settings: ReminderSettings) => {
    env.store(settings);
    await env.shareWithWorker(settings);
  };

  /** Sends settings to the server and, only on its confirmation, records them as "on". */
  const confirm = async (settings: ReminderSettings, subscription: PushSubscriptionData) => {
    await env.api.save(settings, subscription);
    await remember(settings);
    set({ status: 'on', settings, busy: false, error: null });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async reconcile({ unit }) {
      const support = env.support();
      if (support !== 'supported') {
        set({ status: support, settings: null });
        return;
      }
      const stored = env.load();
      const permission = env.permission();

      if (permission === 'denied') {
        if (stored) await forget();
        set({ status: 'blocked', settings: null, note: stored ? 'turned-off-elsewhere' : null });
        return;
      }

      const subscription = permission === 'granted' ? await env.getSubscription() : null;
      if (!stored || !subscription) {
        // The reminder was on, but the permission or the subscription has gone.
        if (stored) await forget();
        set({ status: 'off', settings: null, note: stored ? 'turned-off-elsewhere' : null });
        return;
      }

      // Still on. Show it at once, then quietly bring the server up to date:
      // a new time zone after travel, a changed unit, and a renewed expiry.
      set({ status: 'on', settings: stored });
      const current = { ...stored, unit, timeZone: env.timeZone() };
      try {
        await confirm(current, subscription);
      } catch {
        // A failed quiet refresh is not the user's problem; the reminder stays as it was.
        set({ status: 'on', settings: stored, busy: false });
      }
    },

    async enable(settings) {
      // First, and before anything else is awaited: the permission prompt.
      const permissionRequest = env.requestPermission();
      set({ busy: true, error: null, note: null });
      try {
        const permission = await permissionRequest;
        if (permission !== 'granted') {
          set({ status: permission === 'denied' ? 'blocked' : 'off', busy: false });
          return;
        }
        const subscription =
          (await env.getSubscription()) ??
          (await env.subscribe().catch((cause: unknown) => {
            // The browser's own push service said no. Our server was never asked, so it is not blamed.
            throw isAppError(cause)
              ? cause
              : new AppError('provider-down', 'browser-push', { cause });
          }));
        await confirm({ ...settings, timeZone: env.timeZone() }, subscription);
      } catch (error) {
        // Not confirmed, so not on.
        set({ status: 'off', settings: null, busy: false, error: toError(error) });
      }
    },

    async update(settings) {
      set({ busy: true, error: null, note: null });
      try {
        const subscription = await env.getSubscription();
        if (!subscription) throw new AppError('not-found', 'push');
        await confirm({ ...settings, timeZone: env.timeZone() }, subscription);
      } catch (error) {
        // The previous, confirmed settings are still what the server has.
        set({ busy: false, error: toError(error) });
      }
    },

    async disable() {
      set({ busy: true, error: null, note: null });
      try {
        const subscription = await env.getSubscription();
        if (subscription) await env.api.remove(subscription.endpoint);
        await env.unsubscribe();
        await forget();
        set({ status: 'off', settings: null, busy: false });
      } catch (error) {
        set({ busy: false, error: toError(error) });
      }
    },

    async sendTest() {
      set({ busy: true, error: null, note: null });
      try {
        const subscription = await env.getSubscription();
        if (!subscription) throw new AppError('not-found', 'push');
        await env.api.test(subscription.endpoint);
        set({ busy: false, note: 'test-sent' });
      } catch (error) {
        set({ busy: false, error: toError(error) });
      }
    },

    recheckPermission() {
      if (env.support() !== 'supported') return;
      const permission = env.permission();
      if (permission === 'denied' && state.status !== 'blocked') {
        void forget();
        set({
          status: 'blocked',
          settings: null,
          note: state.status === 'on' ? 'turned-off-elsewhere' : null,
        });
      } else if (permission !== 'denied' && state.status === 'blocked') {
        set({ status: 'off', note: null });
      }
    },

    dismissNote() {
      set({ note: null });
    },
  };
}

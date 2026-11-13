import { AppError } from '@/domain/errors';
import { createReminderController } from './reminderController';
import { createTestEnv, karachiSettings, subscription } from './testEnv';

const choice = { time: '07:30', city: karachiSettings.city, unit: 'metric' } as const;
const on = { permission: 'granted', subscription, stored: karachiSettings } as const;

describe('on app open', () => {
  it('starts in "checking"', () => {
    expect(createReminderController(createTestEnv().env).getState().status).toBe('checking');
  });

  it.each([
    ['unsupported', 'unsupported'],
    ['ios-install', 'ios-install'],
  ] as const)('reports %s and asks the browser nothing else', async (support, status) => {
    const { env, calls } = createTestEnv({ support });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState().status).toBe(status);
    expect(calls).toEqual([]);
  });

  it('is off for a new visitor, with no prompt and no request', async () => {
    const { env, requestPermission, api } = createTestEnv();
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({ status: 'off', settings: null, note: null });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('is blocked when notifications are denied', async () => {
    const { env } = createTestEnv({ permission: 'denied' });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({ status: 'blocked', note: null });
  });

  it('is on when the settings, the permission and the subscription are all still there', async () => {
    const { env, api } = createTestEnv(on);
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({
      status: 'on',
      settings: karachiSettings,
      error: null,
    });
    // Renewed quietly, which also refreshes the server's 90-day expiry.
    expect(api.save).toHaveBeenCalledExactlyOnceWith(karachiSettings, subscription);
  });

  it('updates the server when the time zone or unit has changed', async () => {
    const { env, api, world } = createTestEnv({ ...on, timeZone: 'Europe/London' });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'imperial' });

    const expected = { ...karachiSettings, timeZone: 'Europe/London', unit: 'imperial' };
    expect(api.save).toHaveBeenCalledExactlyOnceWith(expected, subscription);
    expect(controller.getState().settings).toEqual(expected);
    expect(world.stored).toEqual(expected);
  });

  it('stays on, unchanged, if that quiet refresh fails', async () => {
    const { env, api } = createTestEnv(on);
    api.save.mockRejectedValueOnce(new AppError('offline', 'push'));
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({
      status: 'on',
      settings: karachiSettings,
      error: null,
    });
  });

  it('shows off, with a note, when the subscription has gone', async () => {
    const { env, world, shared } = createTestEnv({ ...on, subscription: null });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({
      status: 'off',
      settings: null,
      note: 'turned-off-elsewhere',
    });
    expect(world.stored).toBeNull();
    expect(shared.at(-1)).toBeNull();
  });

  it('shows off, with a note, when the permission was reset', async () => {
    const { env } = createTestEnv({ ...on, permission: 'default' });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({ status: 'off', note: 'turned-off-elsewhere' });
  });

  it('shows blocked, with a note, when the permission was revoked', async () => {
    const { env, world } = createTestEnv({ ...on, permission: 'denied' });
    const controller = createReminderController(env);

    await controller.reconcile({ unit: 'metric' });

    expect(controller.getState()).toMatchObject({
      status: 'blocked',
      note: 'turned-off-elsewhere',
    });
    expect(world.stored).toBeNull();
  });
});

describe('turning on', () => {
  it('asks for permission first, then subscribes, then saves, and is on only after the server confirms', async () => {
    const { env, calls, world, shared } = createTestEnv();
    const controller = createReminderController(env);
    await controller.reconcile({ unit: 'metric' });
    calls.length = 0;

    const enabling = controller.enable(choice);

    // Requested synchronously, inside the click, before anything is awaited.
    expect(calls).toEqual(['requestPermission']);
    expect(controller.getState()).toMatchObject({ status: 'off', busy: true });

    await enabling;
    expect(calls).toEqual(['requestPermission', 'getSubscription', 'subscribe', 'api.save']);
    expect(controller.getState()).toMatchObject({
      status: 'on',
      settings: karachiSettings,
      busy: false,
    });
    expect(world.stored).toEqual(karachiSettings);
    expect(shared.at(-1)).toEqual(karachiSettings);
  });

  it('reuses a subscription the browser already has', async () => {
    const { env, calls } = createTestEnv({ subscription });
    const controller = createReminderController(env);

    await controller.enable(choice);

    expect(calls).not.toContain('subscribe');
    expect(controller.getState().status).toBe('on');
  });

  it('becomes blocked when the user refuses, and nothing is sent to the server', async () => {
    const { env, api, calls } = createTestEnv({ promptAnswer: 'denied' });
    const controller = createReminderController(env);

    await controller.enable(choice);

    expect(controller.getState()).toMatchObject({ status: 'blocked', busy: false, error: null });
    expect(calls).toEqual(['requestPermission']);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('stays off when the user closes the prompt without answering', async () => {
    const { env, api } = createTestEnv({ promptAnswer: 'default' });
    const controller = createReminderController(env);

    await controller.enable(choice);

    expect(controller.getState()).toMatchObject({ status: 'off', error: null });
    expect(api.save).not.toHaveBeenCalled();
  });

  it('is not on when the server could not save it, and says why', async () => {
    const { env, api, world } = createTestEnv();
    api.save.mockRejectedValueOnce(new AppError('provider-down', 'push'));
    const controller = createReminderController(env);

    await controller.enable(choice);

    expect(controller.getState()).toMatchObject({
      status: 'off',
      settings: null,
      busy: false,
      error: { kind: 'provider-down', source: 'push' },
    });
    expect(world.stored).toBeNull();
  });

  it('is not on when the browser could not create a subscription', async () => {
    const { env } = createTestEnv();
    env.subscribe = () => Promise.reject(new DOMException('Registration failed', 'AbortError'));
    const controller = createReminderController(env);

    await controller.enable(choice);

    expect(controller.getState()).toMatchObject({ status: 'off', error: { source: 'push' } });
  });
});

describe('while on', () => {
  async function started() {
    const context = createTestEnv(on);
    const controller = createReminderController(context.env);
    await controller.reconcile({ unit: 'metric' });
    context.api.save.mockClear();
    return { ...context, controller };
  }

  it('saves a new time', async () => {
    const { controller, api, world } = await started();

    await controller.update({ ...choice, time: '06:15' });

    const expected = { ...karachiSettings, time: '06:15' };
    expect(api.save).toHaveBeenCalledExactlyOnceWith(expected, subscription);
    expect(controller.getState()).toMatchObject({ status: 'on', settings: expected });
    expect(world.stored).toEqual(expected);
  });

  it('keeps the confirmed settings when a change cannot be saved', async () => {
    const { controller, api, world } = await started();
    api.save.mockRejectedValueOnce(new AppError('timeout', 'push'));

    await controller.update({ ...choice, time: '06:15' });

    expect(controller.getState()).toMatchObject({
      status: 'on',
      settings: karachiSettings,
      error: { kind: 'timeout' },
    });
    expect(world.stored).toEqual(karachiSettings);
  });

  it('asks the server for a test notification', async () => {
    const { controller, api } = await started();

    await controller.sendTest();

    expect(api.test).toHaveBeenCalledExactlyOnceWith(subscription.endpoint);
    expect(controller.getState()).toMatchObject({ status: 'on', note: 'test-sent', error: null });
  });

  it('reports a test that could not be sent', async () => {
    const { controller, api } = await started();
    api.test.mockRejectedValueOnce(new AppError('rate-limited', 'push'));

    await controller.sendTest();

    expect(controller.getState()).toMatchObject({ note: null, error: { kind: 'rate-limited' } });
  });

  it('turning off removes it from the server, the browser and local storage', async () => {
    const { controller, api, world, calls, shared } = await started();

    await controller.disable();

    expect(api.remove).toHaveBeenCalledExactlyOnceWith(subscription.endpoint);
    expect(calls).toContain('unsubscribe');
    expect(world.stored).toBeNull();
    expect(shared.at(-1)).toBeNull();
    expect(controller.getState()).toMatchObject({ status: 'off', settings: null });
  });

  it('stays on if the server could not be told to remove it', async () => {
    const { controller, api } = await started();
    api.remove.mockRejectedValueOnce(new AppError('offline', 'push'));

    await controller.disable();

    expect(controller.getState()).toMatchObject({ status: 'on', error: { kind: 'offline' } });
  });
});

describe('when the page regains focus', () => {
  it('leaves "blocked" once the user has allowed notifications again', async () => {
    const { env, world } = createTestEnv({ permission: 'denied' });
    const controller = createReminderController(env);
    await controller.reconcile({ unit: 'metric' });

    world.permission = 'default';
    controller.recheckPermission();

    expect(controller.getState().status).toBe('off');
  });

  it('becomes blocked, with a note, if notifications were denied while it was on', async () => {
    const { env, world } = createTestEnv(on);
    const controller = createReminderController(env);
    await controller.reconcile({ unit: 'metric' });

    world.permission = 'denied';
    controller.recheckPermission();

    expect(controller.getState()).toMatchObject({
      status: 'blocked',
      settings: null,
      note: 'turned-off-elsewhere',
    });
  });

  it('changes nothing when nothing changed', async () => {
    const { env } = createTestEnv(on);
    const controller = createReminderController(env);
    await controller.reconcile({ unit: 'metric' });
    const before = controller.getState();

    controller.recheckPermission();

    expect(controller.getState()).toBe(before);
  });
});

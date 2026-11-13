import { createConnectivity } from './connectivity';

function setup(initiallyOnline = true) {
  const browser = { online: initiallyOnline };
  const store = createConnectivity(window, () => browser.online);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  const goOffline = () => {
    browser.online = false;
    window.dispatchEvent(new Event('offline'));
  };
  const goOnline = () => {
    browser.online = true;
    window.dispatchEvent(new Event('online'));
  };
  return { store, listener, unsubscribe, goOffline, goOnline };
}

describe('connectivity', () => {
  it('follows the browser’s offline and online events', () => {
    const { store, listener, goOffline, goOnline, unsubscribe } = setup();
    expect(store.isOnline()).toBe(true);

    goOffline();
    expect(store.isOnline()).toBe(false);

    goOnline();
    expect(store.isOnline()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('goes offline when a request cannot get out, even though the browser says online', () => {
    const { store, listener, unsubscribe } = setup();

    store.reportUnreachable();

    expect(store.isOnline()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('comes back when a later request succeeds', () => {
    const { store, unsubscribe } = setup();
    store.reportUnreachable();

    store.reportReachable();

    expect(store.isOnline()).toBe(true);
    unsubscribe();
  });

  it('comes back when the browser reports a new connection', () => {
    const { store, goOnline, unsubscribe } = setup();
    store.reportUnreachable();

    goOnline();

    expect(store.isOnline()).toBe(true);
    unsubscribe();
  });

  it('does not notify when nothing changed', () => {
    const { store, listener, unsubscribe } = setup();

    store.reportReachable();
    store.reportReachable();
    store.reportUnreachable();
    store.reportUnreachable();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stays offline while the browser itself is offline, whatever requests report', () => {
    const { store, goOffline, unsubscribe } = setup();
    goOffline();

    store.reportReachable();

    expect(store.isOnline()).toBe(false);
    unsubscribe();
  });

  it('stops listening to the window once nobody is subscribed', () => {
    const { store, listener, unsubscribe, goOffline } = setup();
    unsubscribe();

    goOffline();

    expect(listener).not.toHaveBeenCalled();
    expect(store.isOnline()).toBe(false);
  });
});

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallPrompt } from './InstallPrompt';
import { decideInstallState, install } from './installStore';
import { OfflineReadyToast, UpdateNotice } from './PwaNotices';
import { pwa } from './pwaStore';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DESKTOP_FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0';

afterEach(() => {
  act(() => {
    pwa.simulate({ updateReady: false, offlineReady: false });
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('update notice', () => {
  it('is absent until a new version is waiting', () => {
    render(<UpdateNotice />);

    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();
  });

  it('offers Reload and Later, and never applies the update by itself', async () => {
    const applyUpdate = vi.spyOn(pwa, 'applyUpdate').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<UpdateNotice />);

    act(() => {
      pwa.simulate({ updateReady: true });
    });

    expect(screen.getByText('A new version of WeatherBoard is ready')).toBeVisible();
    expect(applyUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('Later hides the notice and leaves the current version running', async () => {
    const applyUpdate = vi.spyOn(pwa, 'applyUpdate').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<UpdateNotice />);
    act(() => {
      pwa.simulate({ updateReady: true });
    });

    await user.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});

describe('offline-ready notice', () => {
  it('appears once the shell is cached, as a polite status, then goes away by itself', () => {
    vi.useFakeTimers();
    render(<OfflineReadyToast />);

    act(() => {
      pwa.simulate({ offlineReady: true });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Ready to use offline');

    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByText('Ready to use offline')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Ready to use offline')).not.toBeInTheDocument();
  });
});

describe('decideInstallState', () => {
  const env = { userAgent: DESKTOP_CHROME, standalone: false, dismissed: false };

  it.each([
    ['Chromium that has offered installation', env, true, 'prompt'],
    ['Chromium that has not offered it', env, false, 'hidden'],
    ['Firefox on desktop', { ...env, userAgent: DESKTOP_FIREFOX }, false, 'hidden'],
    ['Safari on an iPhone', { ...env, userAgent: IPHONE_SAFARI }, false, 'ios-steps'],
    [
      'Chrome on an iPhone, which cannot add to the Home Screen',
      { ...env, userAgent: IPHONE_CHROME },
      false,
      'hidden',
    ],
    ['an app that is already installed', { ...env, standalone: true }, true, 'hidden'],
    [
      'an installed app on an iPhone',
      { ...env, userAgent: IPHONE_SAFARI, standalone: true },
      false,
      'hidden',
    ],
    ['a user who dismissed it', { ...env, dismissed: true }, true, 'hidden'],
    [
      'an iPhone user who dismissed it',
      { ...env, userAgent: IPHONE_SAFARI, dismissed: true },
      false,
      'hidden',
    ],
  ] as const)('%s -> %s', (_label, environment, hasPrompt, kind) => {
    expect(decideInstallState(environment, hasPrompt)).toEqual({ kind });
  });
});

describe('InstallPrompt', () => {
  /** What Chromium dispatches when the app becomes installable. */
  function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const prompt = vi.fn(() => Promise.resolve());
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return { prompt, event };
  }

  beforeEach(() => {
    window.localStorage.clear();
    install.start();
    // Withdraws any offer left over from the previous test.
    window.dispatchEvent(new Event('appinstalled'));
  });

  it('is a labelled, non-modal region that takes no focus', () => {
    render(<InstallPrompt />);
    offerInstall();

    expect(screen.getByRole('complementary', { name: 'Install WeatherBoard' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('shows nothing where installing is not possible', () => {
    render(<InstallPrompt />);

    expect(screen.queryByText(/Install/)).not.toBeInTheDocument();
  });

  it('offers "Install app" once the browser allows it, and opens the browser’s dialog', async () => {
    const user = userEvent.setup();
    render(<InstallPrompt />);

    const { prompt, event } = offerInstall();

    // The browser's own mini-infobar is suppressed in favour of this entry point.
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Install app' }));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('dismissing hides it and is remembered', async () => {
    const user = userEvent.setup();
    render(<InstallPrompt />);
    offerInstall();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('wb:install-dismissed')).toBe('1');
    // A later offer from the browser does not bring it back.
    offerInstall();
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('disappears once the app has been installed', () => {
    render(<InstallPrompt />);
    offerInstall();
    expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('on iOS Safari, shows the Add to Home Screen steps instead of a button that cannot work', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    const user = userEvent.setup();
    render(<InstallPrompt />);
    act(() => {
      // Any install signal makes the store look at its environment again.
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument();
  });
});

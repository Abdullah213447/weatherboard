import { safeStorage } from '@/lib/safeStorage';

/**
 * Whether, and how, the app can be installed from here.
 *
 * Chromium fires `beforeinstallprompt` when it would offer installation; the
 * event is kept so our own button can trigger the browser's dialog. iOS Safari
 * has no such event: installing is a manual "Add to Home Screen", so there the
 * app can only show the steps.
 */

const DISMISSED_KEY = 'wb:install-dismissed';

/** The non-standard event Chromium fires. Not in TypeScript's DOM types. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState =
  /** Nothing to offer: unsupported, already installed, or dismissed. */
  | { kind: 'hidden' }
  /** The browser will show its install dialog if asked. */
  | { kind: 'prompt' }
  /** iOS Safari: the user has to do it by hand. */
  | { kind: 'ios-steps' };

type Env = {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
};

/** Pure decision, so every combination can be tested. */
export function decideInstallState(env: Env, hasPrompt: boolean): InstallState {
  if (env.standalone || env.dismissed) return { kind: 'hidden' };
  if (hasPrompt) return { kind: 'prompt' };
  const ios = /iphone|ipad|ipod/i.test(env.userAgent);
  // On iOS only Safari can add to the Home Screen; Chrome and Firefox there cannot.
  const safari = /safari/i.test(env.userAgent) && !/crios|fxios|edgios/i.test(env.userAgent);
  return ios && safari ? { kind: 'ios-steps' } : { kind: 'hidden' };
}

function isStandalone(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS reports an installed web app through this non-standard property.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { kind: 'hidden' };
const listeners = new Set<() => void>();
let started = false;

function refresh(): void {
  state = decideInstallState(
    {
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      dismissed: safeStorage.get(DISMISSED_KEY) === '1',
    },
    deferred !== null,
  );
  for (const listener of listeners) listener();
}

export const install = {
  getState: (): InstallState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Starts listening for the browser's install signals. Safe to call more than once. */
  start: (): void => {
    if (started) return;
    started = true;
    window.addEventListener('beforeinstallprompt', (event) => {
      // Stops Chrome's own mini-infobar; our entry point replaces it.
      event.preventDefault();
      deferred = event as BeforeInstallPromptEvent;
      refresh();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      refresh();
    });
    refresh();
  },
  /** Opens the browser's install dialog. The offer cannot be reused afterwards. */
  promptInstall: async (): Promise<void> => {
    const event = deferred;
    if (!event) return;
    deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Declining the browser's dialog is an answer: do not keep asking.
    if (outcome === 'dismissed') safeStorage.set(DISMISSED_KEY, '1');
    refresh();
  },
  dismiss: (): void => {
    safeStorage.set(DISMISSED_KEY, '1');
    refresh();
  },
};

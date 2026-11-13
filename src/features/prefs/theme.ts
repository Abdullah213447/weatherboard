import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/lib/safeStorage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Storage key and canvas colours are duplicated in the inline script in
 * index.html, which applies the theme before first paint. theme.test.ts fails
 * if the two drift apart.
 */
export const THEME_STORAGE_KEY = 'wb:theme';
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f7f7f5', dark: '#0e0f11' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function systemPrefersDark(): boolean {
  // matchMedia is absent in some embedded browsers and in the test environment.
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function readPreference(): ThemePreference {
  const stored = safeStorage.get(THEME_STORAGE_KEY);
  return isPreference(stored) ? stored : 'system';
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
}

let preference = readPreference();
const listeners = new Set<() => void>();

function emit(): void {
  apply(resolveTheme(preference, systemPrefersDark()));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size > 1) {
    return () => {
      listeners.delete(listener);
    };
  }

  // First subscriber: follow the system setting and changes from other tabs.
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  media?.addEventListener('change', emit);
  const unsubscribeStorage = safeStorage.subscribe(THEME_STORAGE_KEY, (value) => {
    preference = isPreference(value) ? value : 'system';
    emit();
  });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media?.removeEventListener('change', emit);
      unsubscribeStorage();
    }
  };
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  safeStorage.set(THEME_STORAGE_KEY, next);
  emit();
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
} {
  const current = useSyncExternalStore(subscribe, () => preference);
  const resolved = useSyncExternalStore(subscribe, () =>
    resolveTheme(preference, systemPrefersDark()),
  );
  return { preference: current, resolved, setPreference: setThemePreference };
}

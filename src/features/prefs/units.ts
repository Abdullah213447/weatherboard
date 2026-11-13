import { useSyncExternalStore } from 'react';
import { defaultUnitSystem, type UnitSystem } from '@/domain/units';
import { safeStorage } from '@/lib/safeStorage';

/**
 * Celsius or Fahrenheit. Until the user chooses, the browser's locale
 * decides; once they choose, that is remembered. Weather is always fetched
 * and stored in metric, so switching converts what is on screen and never
 * triggers a request.
 */

export const UNITS_STORAGE_KEY = 'wb:units';

function isUnitSystem(value: unknown): value is UnitSystem {
  return value === 'metric' || value === 'imperial';
}

function read(): UnitSystem {
  const stored = safeStorage.get(UNITS_STORAGE_KEY);
  return isUnitSystem(stored) ? stored : defaultUnitSystem(navigator.language);
}

let units: UnitSystem | null = null;
const listeners = new Set<() => void>();

function current(): UnitSystem {
  units ??= read();
  return units;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribeStorage =
    listeners.size === 1
      ? safeStorage.subscribe(UNITS_STORAGE_KEY, (value) => {
          units = isUnitSystem(value) ? value : null;
          emit();
        })
      : undefined;
  return () => {
    listeners.delete(listener);
    unsubscribeStorage?.();
  };
}

export function setUnitSystem(next: UnitSystem): void {
  units = next;
  safeStorage.set(UNITS_STORAGE_KEY, next);
  emit();
}

/** For tests: forget the choice so the locale default is read again. */
export function resetUnitsForTests(): void {
  units = null;
}

export function useUnits(): UnitSystem {
  return useSyncExternalStore(subscribe, current);
}

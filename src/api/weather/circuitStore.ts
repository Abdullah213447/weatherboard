import { z } from 'zod';
import { CLOSED_CIRCUIT, type CircuitState } from './fallback';

const KEY = 'wb:owm-circuit';

const schema = z.object({
  consecutiveFailures: z.number().int().nonnegative(),
  openUntil: z.number().nullable(),
});

export type CircuitStore = {
  load(): CircuitState;
  save(state: CircuitState): void;
};

/**
 * Remembers the circuit for the browsing session, so a reload during a
 * cool-down does not immediately hammer a provider that asked us to stop.
 * sessionStorage, not localStorage: a new session deserves a fresh attempt.
 * If storage is unavailable the state simply lives in memory.
 */
export function createCircuitStore(getStorage: () => Storage): CircuitStore {
  let memory: CircuitState = CLOSED_CIRCUIT;
  return {
    load() {
      try {
        const raw = getStorage().getItem(KEY);
        if (raw === null) return memory;
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : memory;
      } catch {
        return memory;
      }
    },
    save(state) {
      memory = state;
      try {
        getStorage().setItem(KEY, JSON.stringify(state));
      } catch {
        // Memory already holds it.
      }
    },
  };
}

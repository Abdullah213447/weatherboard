import type { AppErrorKind } from '@/domain/errors';

/**
 * The fallback policy: when OpenWeatherMap is used, when Open-Meteo takes
 * over, and when OpenWeatherMap is left alone for a while. Pure functions of
 * (outcome, circuit state), mirroring the decision table in docs/PLAN.md §4.
 */

export type CircuitState = {
  /** Server errors, timeouts and unreadable bodies in a row. Reset by a success. */
  consecutiveFailures: number;
  /** Epoch milliseconds until which OpenWeatherMap is skipped. Null when closed. */
  openUntil: number | null;
};

export const CLOSED_CIRCUIT: CircuitState = { consecutiveFailures: 0, openUntil: null };
export const CIRCUIT_OPEN_MS = 10 * 60 * 1000;
export const FAILURE_THRESHOLD = 2;
/**
 * "Never reopen". The circuit lives in sessionStorage, so this lasts for the
 * browsing session. A finite number, because JSON cannot store Infinity.
 */
export const OPEN_FOR_SESSION = Number.MAX_SAFE_INTEGER;

/** What the primary provider did, as far as the policy cares. */
export type PrimaryOutcome = { ok: true } | { ok: false; kind: AppErrorKind };

export type Decision = {
  /**
   * `use-primary`: show OpenWeatherMap's data.
   * `fallback`: ask Open-Meteo.
   * `stop`: nothing can succeed right now; go to the cached snapshot or an error.
   */
  action: 'use-primary' | 'fallback' | 'stop';
  circuit: CircuitState;
  /** A problem only the developer can fix. Logged, never shown to the user. */
  developerWarning?: string;
};

/**
 * Whether to try OpenWeatherMap at all. While the circuit is open it is
 * skipped; once the cool-down passes, the next request tries it once.
 */
export function shouldTryPrimary(circuit: CircuitState, now: number): boolean {
  return circuit.openUntil === null || now >= circuit.openUntil;
}

export function decideAfterPrimary(
  outcome: PrimaryOutcome,
  circuit: CircuitState,
  now: number,
): Decision {
  if (outcome.ok) {
    return { action: 'use-primary', circuit: CLOSED_CIRCUIT };
  }

  switch (outcome.kind) {
    // Quota exhausted: asking again only makes it worse. Back off for the full cool-down.
    case 'rate-limited':
      return {
        action: 'fallback',
        circuit: { consecutiveFailures: 0, openUntil: now + CIRCUIT_OPEN_MS },
      };

    // A rejected key is ours to fix and will not start working mid-session, so
    // OpenWeatherMap is skipped until the session ends. The user still gets
    // weather from the fallback and never sees this.
    case 'auth':
      return {
        action: 'fallback',
        circuit: { consecutiveFailures: 0, openUntil: OPEN_FOR_SESSION },
        developerWarning:
          'OpenWeatherMap rejected the API key (new keys can take a while to activate). Using Open-Meteo instead.',
      };

    // Their side is struggling. One failure is a blip; two in a row opens the circuit.
    case 'provider-down':
    case 'timeout':
    case 'bad-response':
    case 'not-found': {
      const consecutiveFailures = circuit.consecutiveFailures + 1;
      return {
        action: 'fallback',
        circuit: {
          consecutiveFailures,
          openUntil: consecutiveFailures >= FAILURE_THRESHOLD ? now + CIRCUIT_OPEN_MS : null,
        },
      };
    }

    // The device has no connection: the fallback would fail the same way.
    case 'offline':
      return { action: 'stop', circuit };

    // Online, yet the request never arrived. It may be this one host that is
    // blocked on this network, so the other provider gets one attempt.
    case 'network':
      return { action: 'fallback', circuit };
  }
}

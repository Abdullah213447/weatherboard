import {
  CIRCUIT_OPEN_MS,
  CLOSED_CIRCUIT,
  decideAfterPrimary,
  shouldTryPrimary,
  type CircuitState,
} from './fallback';

const NOW = 1_000_000;
const oneFailure: CircuitState = { consecutiveFailures: 1, openUntil: null };

// One test per row of the decision table in docs/PLAN.md §4.
describe('decideAfterPrimary', () => {
  it('row 1: a valid response is used and clears any failure count', () => {
    expect(decideAfterPrimary({ ok: true }, oneFailure, NOW)).toEqual({
      action: 'use-primary',
      circuit: CLOSED_CIRCUIT,
    });
  });

  it('row 2: a rate limit falls back and opens the circuit for 10 minutes', () => {
    expect(decideAfterPrimary({ ok: false, kind: 'rate-limited' }, CLOSED_CIRCUIT, NOW)).toEqual({
      action: 'fallback',
      circuit: { consecutiveFailures: 0, openUntil: NOW + CIRCUIT_OPEN_MS },
    });
    expect(CIRCUIT_OPEN_MS).toBe(600_000);
  });

  it('row 3: a rejected key falls back and warns the developer, not the user', () => {
    const decision = decideAfterPrimary({ ok: false, kind: 'auth' }, CLOSED_CIRCUIT, NOW);

    expect(decision.action).toBe('fallback');
    expect(decision.circuit).toEqual(CLOSED_CIRCUIT);
    expect(decision.developerWarning).toMatch(/OpenWeatherMap rejected the API key/);
  });

  it.each(['provider-down', 'timeout', 'bad-response'] as const)(
    'row 4: a first %s falls back for this request and leaves the circuit closed',
    (kind) => {
      expect(decideAfterPrimary({ ok: false, kind }, CLOSED_CIRCUIT, NOW)).toEqual({
        action: 'fallback',
        circuit: { consecutiveFailures: 1, openUntil: null },
      });
    },
  );

  it.each(['provider-down', 'timeout', 'bad-response'] as const)(
    'row 4: a second consecutive %s opens the circuit',
    (kind) => {
      expect(decideAfterPrimary({ ok: false, kind }, oneFailure, NOW)).toEqual({
        action: 'fallback',
        circuit: { consecutiveFailures: 2, openUntil: NOW + CIRCUIT_OPEN_MS },
      });
    },
  );

  it('row 5: offline stops without trying the fallback or touching the circuit', () => {
    expect(decideAfterPrimary({ ok: false, kind: 'offline' }, oneFailure, NOW)).toEqual({
      action: 'stop',
      circuit: oneFailure,
    });
  });

  it('row 6: a network failure while online tries the fallback once, circuit untouched', () => {
    expect(decideAfterPrimary({ ok: false, kind: 'network' }, oneFailure, NOW)).toEqual({
      action: 'fallback',
      circuit: oneFailure,
    });
  });

  it('only a success produces "use-primary"', () => {
    const kinds = [
      'offline',
      'network',
      'timeout',
      'rate-limited',
      'auth',
      'not-found',
      'provider-down',
      'bad-response',
    ] as const;
    for (const kind of kinds) {
      expect(decideAfterPrimary({ ok: false, kind }, CLOSED_CIRCUIT, NOW).action).not.toBe(
        'use-primary',
      );
    }
  });
});

describe('circuit lifecycle', () => {
  it('skips the primary while open and tries it again once the cool-down has passed', () => {
    const { circuit } = decideAfterPrimary(
      { ok: false, kind: 'rate-limited' },
      CLOSED_CIRCUIT,
      NOW,
    );

    expect(shouldTryPrimary(CLOSED_CIRCUIT, NOW)).toBe(true);
    expect(shouldTryPrimary(circuit, NOW + 1)).toBe(false);
    expect(shouldTryPrimary(circuit, NOW + CIRCUIT_OPEN_MS - 1)).toBe(false);
    expect(shouldTryPrimary(circuit, NOW + CIRCUIT_OPEN_MS)).toBe(true);
  });

  it('closes fully when the retry after the cool-down succeeds', () => {
    const opened = decideAfterPrimary({ ok: false, kind: 'timeout' }, oneFailure, NOW).circuit;
    const later = NOW + CIRCUIT_OPEN_MS;

    expect(decideAfterPrimary({ ok: true }, opened, later).circuit).toEqual(CLOSED_CIRCUIT);
  });

  it('reopens straight away when the retry after the cool-down fails again', () => {
    const opened = decideAfterPrimary({ ok: false, kind: 'timeout' }, oneFailure, NOW).circuit;
    const later = NOW + CIRCUIT_OPEN_MS;

    const { circuit } = decideAfterPrimary({ ok: false, kind: 'provider-down' }, opened, later);

    expect(circuit.openUntil).toBe(later + CIRCUIT_OPEN_MS);
    expect(shouldTryPrimary(circuit, later + 1)).toBe(false);
  });
});

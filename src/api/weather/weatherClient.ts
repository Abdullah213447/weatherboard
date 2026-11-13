import { AppError, isAppError } from '@/domain/errors';
import type { City, WeatherSnapshot } from '@/domain/weather';
import type { CircuitStore } from './circuitStore';
import { decideAfterPrimary, shouldTryPrimary, type PrimaryOutcome } from './fallback';
import type { ProviderWeather, WeatherProvider } from './provider';

export type WeatherClient = (city: City, signal?: AbortSignal) => Promise<WeatherSnapshot>;

type Deps = {
  primary: WeatherProvider;
  fallback: WeatherProvider;
  circuit: CircuitStore;
  now: () => number;
  /** Receives problems only a developer can fix. */
  warn: (message: string) => void;
};

/**
 * Fetches weather for a city, applying the fallback policy. This is the only
 * place that knows there are two providers; everything above it sees one
 * WeatherSnapshot or one AppError.
 */
export function createWeatherClient({
  primary,
  fallback,
  circuit,
  now,
  warn,
}: Deps): WeatherClient {
  return async (city, signal) => {
    const withCity = (weather: ProviderWeather): WeatherSnapshot => ({ city, ...weather });

    if (shouldTryPrimary(circuit.load(), now())) {
      let outcome: PrimaryOutcome;
      let weather: ProviderWeather | undefined;
      try {
        weather = await primary.fetch(city.coords, signal);
        outcome = { ok: true };
      } catch (error) {
        // Cancellations and programming errors are not provider outcomes.
        if (!isAppError(error)) throw error;
        outcome = { ok: false, kind: error.kind };
      }

      const decision = decideAfterPrimary(outcome, circuit.load(), now());
      circuit.save(decision.circuit);
      if (decision.developerWarning) warn(decision.developerWarning);

      if (decision.action === 'use-primary' && weather) return withCity(weather);
      if (decision.action === 'stop') throw new AppError('offline', 'weather');
    }

    try {
      return withCity(await fallback.fetch(city.coords, signal));
    } catch (error) {
      if (!isAppError(error)) throw error;
      // Both providers have failed. Connectivity problems keep their kind,
      // because the user can act on those; anything else is "weather is down".
      const kind =
        error.kind === 'offline' || error.kind === 'network' ? error.kind : 'provider-down';
      throw new AppError(kind, 'weather', { cause: error });
    }
  };
}

import { isAppError } from '@/domain/errors';
import { connectivity } from '@/lib/connectivity';
import { fetchJson } from '../http';
import { createCircuitStore } from './circuitStore';
import { createOpenMeteoProvider } from './openMeteo';
import { createOpenWeatherMapProvider } from './openWeatherMap';
import { createWeatherClient, type WeatherClient } from './weatherClient';

const now = () => Date.now();

const client = createWeatherClient({
  primary: createOpenWeatherMapProvider({
    apiKey: import.meta.env.VITE_OPENWEATHER_API_KEY,
    fetchJson,
    now,
  }),
  fallback: createOpenMeteoProvider({ fetchJson, now }),
  circuit: createCircuitStore(() => window.sessionStorage),
  now,
  warn: (message) => {
    console.warn(`[weather] ${message}`);
  },
});

/**
 * The app's weather source: OpenWeatherMap first, Open-Meteo as the fallback.
 * When neither provider can be reached at all, the app is treated as offline
 * even if the browser still claims a connection.
 */
export const weatherClient: WeatherClient = async (city, signal) => {
  try {
    return await client(city, signal);
  } catch (error) {
    if (isAppError(error) && error.source === 'weather' && error.kind === 'network') {
      connectivity.reportUnreachable();
    }
    throw error;
  }
};

export type { WeatherClient } from './weatherClient';

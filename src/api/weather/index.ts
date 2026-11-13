import { fetchJson } from '../http';
import { createCircuitStore } from './circuitStore';
import { createOpenMeteoProvider } from './openMeteo';
import { createOpenWeatherMapProvider } from './openWeatherMap';
import { createWeatherClient } from './weatherClient';

const now = () => Date.now();

/** The app's weather source: OpenWeatherMap first, Open-Meteo as the fallback. */
export const weatherClient = createWeatherClient({
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

export type { WeatherClient } from './weatherClient';

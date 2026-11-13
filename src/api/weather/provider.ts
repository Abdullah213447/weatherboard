import type { Coordinates, ProviderId, WeatherSnapshot } from '@/domain/weather';

/** Everything in a snapshot except the city, which the caller already knows. */
export type ProviderWeather = Omit<WeatherSnapshot, 'city'>;

export type WeatherProvider = {
  id: ProviderId;
  fetch(coords: Coordinates, signal?: AbortSignal): Promise<ProviderWeather>;
};

import { relativeTime } from '@/domain/time';
import type { ProviderId } from '@/domain/weather';
import { cx } from '@/ui/cx';
import type { WeatherState } from './useWeather';

const PROVIDER: Record<ProviderId, string> = {
  openweathermap: 'OpenWeatherMap',
  // Open-Meteo only ever answers when the first source could not.
  'open-meteo': 'Open-Meteo (backup)',
};

type WeatherStatusProps = { state: WeatherState; now: number };

/**
 * One quiet line in the header: how fresh the data is and where it came
 * from. The dot repeats the message in colour; the words carry the meaning.
 */
export function WeatherStatus({ state, now }: WeatherStatusProps) {
  if (state.status === 'idle') return null;

  let dot = 'bg-subtle motion-safe:animate-pulse-soft';
  let text = 'Loading weather';

  if (state.status === 'success') {
    const backup = state.snapshot.provider === 'open-meteo';
    dot = backup ? 'bg-warning' : 'bg-success';
    text = `Updated ${relativeTime(state.snapshot.fetchedAt, now)} · ${PROVIDER[state.snapshot.provider]}`;
  } else if (state.status === 'error') {
    dot = 'bg-danger';
    text = state.saved
      ? `Could not refresh · saved ${relativeTime(state.saved.fetchedAt, now)}`
      : 'Weather unavailable';
  }

  return (
    <p data-testid="weather-status" className="text-muted flex items-center gap-2 text-xs">
      <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', dot)} />
      <span className="truncate">{text}</span>
    </p>
  );
}

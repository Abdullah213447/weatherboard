import { conditionLabel } from './conditionLabel.js';
import { formatTemperature, TEMPERATURE_UNIT, type UnitSystem } from './units.js';
import type { ConditionKind } from './weather.js';

/** What the server knows about the day when it sends a reminder. */
export type ReminderForecast = {
  /** The temperature right now, when the provider gave one. */
  currentC?: number;
  maxC: number;
  minC: number;
  chancePct?: number;
  kind: ConditionKind;
};

export type ReminderText = { title: string; body: string };

/**
 * The words of the daily notification. With a forecast: "Karachi · 26° and
 * sunny" over "High 29°C, low 24°C. 10% chance of rain." Without one (the
 * weather service could not be reached), a plain reminder that still names
 * the city, because a reminder that arrives late or empty is still better
 * than none.
 */
export function reminderText(
  cityName: string,
  unit: UnitSystem,
  forecast?: ReminderForecast,
): ReminderText {
  if (!forecast) {
    return {
      title: `${cityName} · your daily weather`,
      body: 'Open WeatherBoard for today’s forecast.',
    };
  }

  const symbol = TEMPERATURE_UNIT[unit].symbol.replace('°', '');
  const degrees = (celsius: number) => formatTemperature(celsius, unit);
  const headline = degrees(forecast.currentC ?? forecast.maxC);
  const condition =
    forecast.kind === 'unknown'
      ? ''
      : ` and ${conditionLabel({ kind: forecast.kind, isDay: true }).toLowerCase()}`;
  const chance =
    forecast.chancePct === undefined
      ? ''
      : ` ${String(Math.round(forecast.chancePct))}% chance of rain.`;

  return {
    title: `${cityName} · ${headline}${condition}`,
    body: `High ${degrees(forecast.maxC)}${symbol}, low ${degrees(forecast.minC)}${symbol}.${chance}`,
  };
}

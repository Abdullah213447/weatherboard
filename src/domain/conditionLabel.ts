import type { Condition, ConditionKind } from './weather.js';

const LABELS: Record<ConditionKind, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  'freezing-rain': 'Freezing rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  unknown: 'Conditions unavailable',
};

/** The condition in words. Icons are decorative; this is what is read out. */
export function conditionLabel(condition: Condition): string {
  if (condition.kind === 'clear') return condition.isDay ? 'Sunny' : 'Clear night';
  return LABELS[condition.kind];
}

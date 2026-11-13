import type { ConditionKind } from './weather.js';

/**
 * OpenWeatherMap condition ids: https://openweathermap.org/weather-conditions
 * Grouped by hundreds, with a few ids that need their own answer.
 */
export function conditionFromOwm(id: number): ConditionKind {
  if (id >= 200 && id < 300) return 'thunderstorm';
  if (id >= 300 && id < 400) return 'drizzle';
  if (id === 511) return 'freezing-rain';
  if (id >= 500 && id < 600) return 'rain';
  // 611-613 are sleet: ice falling as rain, closer to freezing rain than to snow.
  if (id >= 611 && id <= 613) return 'freezing-rain';
  if (id >= 600 && id < 700) return 'snow';
  // 701-762: mist, smoke, haze, dust, fog, sand, ash. All reduce visibility.
  if (id >= 701 && id <= 762) return 'fog';
  if (id === 800) return 'clear';
  if (id === 801 || id === 802) return 'partly-cloudy';
  if (id === 803 || id === 804) return 'cloudy';
  // 771 squall, 781 tornado and anything new: no honest icon for these.
  return 'unknown';
}

/**
 * Sky condition from cloud cover alone, using the same bands as the
 * OpenWeatherMap ids above: 800 is up to 10%, 801-802 up to 50%, 803-804 beyond.
 */
export function conditionFromCloudCover(percent: number): ConditionKind {
  if (percent <= 10) return 'clear';
  if (percent <= 50) return 'partly-cloudy';
  return 'cloudy';
}

/** WMO weather interpretation codes, as used by Open-Meteo. */
const WMO: Readonly<Record<number, ConditionKind>> = {
  0: 'clear',
  1: 'clear', // mainly clear
  2: 'partly-cloudy',
  3: 'cloudy', // overcast
  45: 'fog',
  48: 'fog', // depositing rime fog
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezing-rain', // freezing drizzle
  57: 'freezing-rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'freezing-rain',
  67: 'freezing-rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow', // snow grains
  80: 'rain', // rain showers
  81: 'rain',
  82: 'rain',
  85: 'snow', // snow showers
  86: 'snow',
  95: 'thunderstorm',
  96: 'thunderstorm', // with hail
  99: 'thunderstorm',
};

export function conditionFromWmo(code: number): ConditionKind {
  return WMO[code] ?? 'unknown';
}

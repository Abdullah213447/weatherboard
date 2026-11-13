import { conditionFromOwm, conditionFromWmo } from './conditions';

describe('conditionFromWmo', () => {
  it.each([
    [0, 'clear'],
    [1, 'clear'],
    [2, 'partly-cloudy'],
    [3, 'cloudy'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'drizzle'],
    [55, 'drizzle'],
    [56, 'freezing-rain'],
    [61, 'rain'],
    [65, 'rain'],
    [66, 'freezing-rain'],
    [67, 'freezing-rain'],
    [71, 'snow'],
    [77, 'snow'],
    [80, 'rain'],
    [82, 'rain'],
    [85, 'snow'],
    [95, 'thunderstorm'],
    [99, 'thunderstorm'],
  ] as const)('maps WMO code %d to %s', (code, kind) => {
    expect(conditionFromWmo(code)).toBe(kind);
  });

  it('maps a code outside the table to unknown rather than guessing', () => {
    expect(conditionFromWmo(4)).toBe('unknown');
    expect(conditionFromWmo(-1)).toBe('unknown');
  });
});

describe('conditionFromOwm', () => {
  it.each([
    [200, 'thunderstorm'],
    [232, 'thunderstorm'],
    [300, 'drizzle'],
    [500, 'rain'],
    [504, 'rain'],
    [511, 'freezing-rain'],
    [520, 'rain'],
    [600, 'snow'],
    [611, 'freezing-rain'],
    [613, 'freezing-rain'],
    [615, 'snow'],
    [701, 'fog'],
    [721, 'fog'],
    [741, 'fog'],
    [762, 'fog'],
    [771, 'unknown'],
    [781, 'unknown'],
    [800, 'clear'],
    [801, 'partly-cloudy'],
    [802, 'partly-cloudy'],
    [803, 'cloudy'],
    [804, 'cloudy'],
    [999, 'unknown'],
  ] as const)('maps OpenWeatherMap id %d to %s', (id, kind) => {
    expect(conditionFromOwm(id)).toBe(kind);
  });
});

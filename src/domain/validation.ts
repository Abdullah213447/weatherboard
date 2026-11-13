export const MIN_QUERY_LENGTH = 2;

export type CityQueryProblem = 'empty' | 'too-short';

/** What is wrong with the text in the city field, or null if it can be searched. */
export function validateCityQuery(value: string): CityQueryProblem | null {
  const length = value.trim().length;
  if (length === 0) return 'empty';
  if (length < MIN_QUERY_LENGTH) return 'too-short';
  return null;
}

export const CITY_QUERY_MESSAGES: Record<CityQueryProblem, string> = {
  empty: 'Enter a city name',
  'too-short': 'Type at least 2 letters',
};

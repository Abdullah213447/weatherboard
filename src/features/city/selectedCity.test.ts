import type { City } from '@/domain/weather';
import { getSelectedCity, resetSelectedCityForTests, selectCity } from './selectedCity';

const karachi: City = {
  id: 'PK:24.86,67.01',
  name: 'Karachi',
  region: 'Sindh',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 24.86, lon: 67.01 },
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  resetSelectedCityForTests();
});

describe('selected city', () => {
  it('is nothing on a first visit', () => {
    expect(getSelectedCity()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('selecting a city puts it in the URL and remembers it as the last viewed', () => {
    selectCity(karachi);

    expect(getSelectedCity()).toEqual(karachi);
    // Readable in the address bar: the separators are not percent-encoded.
    expect(window.location.search).toBe('?city=Karachi~Sindh~PK~24.8600~67.0100');

    resetSelectedCityForTests();
    window.history.replaceState(null, '', '/');
    expect(getSelectedCity()).toEqual(karachi);
  });

  it('opens on the city in a shared link', () => {
    window.history.replaceState(null, '', '/?city=Tokyo~Tokyo~JP~35.6762~139.6503');

    expect(getSelectedCity()).toMatchObject({
      name: 'Tokyo',
      country: 'Japan',
      countryCode: 'JP',
      coords: { lat: 35.6762, lon: 139.6503 },
    });
  });

  it('prefers the link over the last viewed city', () => {
    selectCity(karachi);
    resetSelectedCityForTests();
    window.history.replaceState(null, '', '/?city=Tokyo~Tokyo~JP~35.6762~139.6503');

    expect(getSelectedCity()?.name).toBe('Tokyo');
  });

  it('restores the last viewed city into the address when opened without a link', () => {
    selectCity(karachi);
    resetSelectedCityForTests();
    window.history.replaceState(null, '', '/');

    getSelectedCity();

    expect(window.location.search).toContain('city=Karachi');
  });

  it('ignores a malformed link and corrupt storage', () => {
    window.localStorage.setItem('wb:last-city', '{not json');
    window.history.replaceState(null, '', '/?city=nonsense');

    expect(getSelectedCity()).toBeNull();
  });
});

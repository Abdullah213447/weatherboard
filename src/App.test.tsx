import openMeteoKarachi from '@fixtures/open-meteo/forecast-karachi.json';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { App } from '@/App';
import { resetSelectedCityForTests } from '@/features/city/selectedCity';

describe('App shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    resetSelectedCityForTests();
  });

  it('renders the landmarks and the product name as the page heading', () => {
    renderWithProviders(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Open-Meteo');
  });

  it('greets a first-time visitor with suggested cities, Karachi among them', () => {
    renderWithProviders(<App />);

    expect(
      screen.getByRole('heading', { name: 'Find a city to see its weather.' }),
    ).toBeInTheDocument();
    const suggestions = screen.getByRole('list', { name: 'Suggested cities' });
    expect(suggestions).toHaveTextContent('Karachi');
  });

  it('does not show the storage notice when storage works', () => {
    renderWithProviders(<App />);

    expect(screen.queryByText(/will not be saved/)).not.toBeInTheDocument();
  });

  it('opens on the city named in the link instead of the first-run state', async () => {
    // No OpenWeatherMap key exists in tests, so the app falls back, as it would for real.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.json(openMeteoKarachi)),
    );
    window.history.replaceState(null, '', '/?city=Karachi~Sindh~PK~24.8607~67.0011');

    renderWithProviders(<App />);

    expect(await screen.findByText('25°')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Karachi' })).toBeInTheDocument();
    expect(screen.getByText('Sindh, Pakistan')).toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Open-Meteo (backup)');
    expect(screen.queryByRole('list', { name: 'Suggested cities' })).not.toBeInTheDocument();
  });
});

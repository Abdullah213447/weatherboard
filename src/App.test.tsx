import { render, screen } from '@testing-library/react';
import { App } from '@/App';
import { resetSelectedCityForTests } from '@/features/city/selectedCity';

describe('App shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    resetSelectedCityForTests();
  });

  it('renders the landmarks and the product name as the page heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Open-Meteo');
  });

  it('greets a first-time visitor with suggested cities, Karachi among them', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Find a city to see its weather.' }),
    ).toBeInTheDocument();
    const suggestions = screen.getByRole('list', { name: 'Suggested cities' });
    expect(suggestions).toHaveTextContent('Karachi');
  });

  it('does not show the storage notice when storage works', () => {
    render(<App />);

    expect(screen.queryByText(/will not be saved/)).not.toBeInTheDocument();
  });

  it('opens on the city named in the link instead of the first-run state', () => {
    window.history.replaceState(null, '', '/?city=Karachi~Sindh~PK~24.8607~67.0011');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: 'Karachi' })).toBeInTheDocument();
    expect(screen.getByText('Sindh, Pakistan')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suggested cities' })).not.toBeInTheDocument();
  });
});

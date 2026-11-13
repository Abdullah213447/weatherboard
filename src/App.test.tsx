import { render, screen } from '@testing-library/react';
import { App } from '@/App';

describe('App shell', () => {
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
});

import { render, screen } from '@testing-library/react';
import { karachiSnapshot } from '@/test/weather';
import type { WeatherState } from './useWeather';
import { WeatherStatus } from './WeatherStatus';

const fresh: WeatherState = {
  status: 'success',
  snapshot: karachiSnapshot,
  isRefreshing: false,
  refresh: () => undefined,
};
const now = karachiSnapshot.fetchedAt + 4 * 60_000;

describe('WeatherStatus', () => {
  it('says when the data was updated and by which source', () => {
    render(<WeatherStatus state={fresh} now={now} />);
    expect(screen.getByTestId('weather-status')).toHaveTextContent(
      'Updated 4 min ago · OpenWeatherMap',
    );
  });

  it('agrees with the offline banner when the connection drops while fresh data is on screen', () => {
    render(<WeatherStatus state={fresh} now={now} offline />);
    const status = screen.getByTestId('weather-status');
    expect(status).toHaveTextContent('Offline · saved 4 min ago');
    expect(status).not.toHaveTextContent('Updated');
  });
});

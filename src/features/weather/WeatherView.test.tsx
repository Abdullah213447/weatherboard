import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WeatherClient } from '@/api/weather/weatherClient';
import { DashboardGrid } from '@/app/DashboardGrid';
import { AppError } from '@/domain/errors';
import type { City, WeatherSnapshot } from '@/domain/weather';
import { resetUnitsForTests, setUnitSystem } from '@/features/prefs/units';
import type { OfflineStore } from '@/lib/offlineStore';
import { renderWithProviders } from '@/test/render';
import { karachi, karachiBackupSnapshot, karachiSnapshot, RECORDED_AT } from '@/test/weather';
import { LiveRegion } from '@/ui/LiveRegion';
import { useWeatherView } from './useWeatherView';

function store(saved: WeatherSnapshot | null = null): OfflineStore {
  return { write: () => Promise.resolve(), read: () => Promise.resolve(saved) };
}

/** The weather area exactly as the app composes it, with injectable data sources. */
function View({
  city,
  client,
  saved,
}: {
  city: City;
  client: WeatherClient;
  saved?: WeatherSnapshot;
}) {
  const view = useWeatherView(city, { client, store: store(saved ?? null) });
  return (
    <>
      <header>{view.status}</header>
      {view.primary && <DashboardGrid primary={view.primary} secondary={null} />}
      <LiveRegion message={view.announcement} />
    </>
  );
}

const resolved = (snapshot: WeatherSnapshot) =>
  vi.fn<WeatherClient>(() => Promise.resolve(snapshot));
const rejected = (error: AppError) => vi.fn<WeatherClient>(() => Promise.reject(error));
const card = () => screen.getByTestId('current-conditions');

beforeEach(() => {
  window.localStorage.clear();
  resetUnitsForTests();
  // The fixture was recorded at 01:38 in Karachi; hold the clock there.
  vi.useFakeTimers({ toFake: ['Date'], now: RECORDED_AT });
  document.title = 'WeatherBoard';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('shows skeletons in the final layout, with the city already named', () => {
    const client = vi.fn<WeatherClient>(() => new Promise(() => undefined));
    renderWithProviders(<View city={karachi} client={client} />);

    expect(card()).toHaveAttribute('aria-busy', 'true');
    expect(within(card()).getByRole('heading', { name: 'Karachi' })).toBeInTheDocument();
    expect(within(card()).getByText('Sindh, Pakistan')).toBeInTheDocument();
    // The metric labels are real from the start, so only values change.
    for (const label of ['Humidity', 'Wind', 'Chance of rain', 'Sunrise', 'Sunset']) {
      expect(within(card()).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: '5-day forecast' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Loading weather');
  });
});

describe('success', () => {
  it('shows current conditions from the recorded Karachi response', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);
    await waitFor(() => {
      expect(card()).not.toHaveAttribute('aria-busy');
    });
    const current = within(card());

    expect(current.getByText('26°')).toBeInTheDocument();
    expect(current.getByText('26 degrees Celsius')).toBeInTheDocument();
    // 721 (haze) at night maps to fog.
    expect(current.getByText('Fog')).toBeInTheDocument();
    expect(current.getByText(/Feels like 26° · High 29° · Low 26°/)).toBeInTheDocument();
    expect(current.getByText('78%')).toBeInTheDocument();
    expect(current.getByText(/6 km\/h/)).toBeInTheDocument();
    expect(current.getByText('W')).toBeInTheDocument();
    expect(current.getByText('0%')).toBeInTheDocument();
    // Sunrise 06:47 and sunset 17:45, in Karachi's time whatever the viewer's zone.
    expect(current.getByText(/^6:47/)).toBeInTheDocument();
    expect(current.getByText(/^(17|5):45/)).toBeInTheDocument();
    // The city's clock and date: 01:38 on Saturday 14 November.
    expect(current.getByText(/1:38/)).toBeInTheDocument();
    expect(current.getByText(/Saturday/)).toBeInTheDocument();
  });

  it('renders a night card in the dark scope with the matching sky tint', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);
    await waitFor(() => {
      expect(card()).not.toHaveAttribute('aria-busy');
    });

    expect(card()).toHaveAttribute('data-theme', 'dark');
    expect(card().style.backgroundColor).toBe('var(--wb-sky-fog-night)');
    expect(card().querySelector('svg[data-condition="fog-night"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('lists five days with today first, its partial flag, and a range bar each', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);
    const forecast = await screen.findByTestId('forecast');
    const rows = within(forecast).getAllByRole('listitem');

    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Today');
    expect(rows[0]).toHaveTextContent('(rest of day)');
    expect(rows[0]).toHaveTextContent('Sunny');
    expect(rows[0]).toHaveTextContent('Low 26°');
    expect(rows[0]).toHaveTextContent('High 29°');
    expect(rows[1]).toHaveTextContent('Sunday');
    expect(rows[1]).not.toHaveTextContent('(rest of day)');
    expect(rows[4]).toHaveTextContent('Wednesday');
    expect(within(forecast).getAllByTestId('range-bar')).toHaveLength(5);
    // Only today carries the current-temperature marker.
    expect(within(forecast).getAllByTestId('current-marker')).toHaveLength(1);
    expect(rows[0]?.querySelector('[data-testid="current-marker"]')).not.toBeNull();
  });

  it('shows the chance of rain on a day only when it is worth mentioning', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiBackupSnapshot)} />);
    const rows = within(await screen.findByTestId('forecast')).getAllByRole('listitem');

    // Open-Meteo reported 73% for today and 2% for tomorrow.
    expect(rows[0]).toHaveTextContent('73% chance of rain');
    expect(rows[1]).not.toHaveTextContent('chance of rain');
  });

  it('says how fresh the data is and which source served it', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);

    await waitFor(() => {
      expect(screen.getByTestId('weather-status')).toHaveTextContent(
        'Updated just now · OpenWeatherMap',
      );
    });
  });

  it('labels the backup source as a backup', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiBackupSnapshot)} />);

    await waitFor(() => {
      expect(screen.getByTestId('weather-status')).toHaveTextContent('Open-Meteo (backup)');
    });
  });

  it('announces the city and temperature, and puts them in the document title', async () => {
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Karachi: 26 degrees Celsius, Fog.');
    });
    expect(document.title).toBe('Karachi 26° · WeatherBoard');
  });
});

describe('clock', () => {
  it('moves the city\u2019s local time and the freshness line forward as time passes', async () => {
    vi.useFakeTimers({ now: RECORDED_AT });
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(within(card()).getByText(/1:38/)).toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Updated just now');

    // Recorded at 01:38:33; the clock ticks every 15 seconds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(within(card()).getByText(/1:39/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(within(card()).getByText(/1:43/)).toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Updated 4 min ago');
  });
});

describe('units', () => {
  it('converts what is on screen without asking for the weather again', async () => {
    const client = resolved(karachiSnapshot);
    renderWithProviders(<View city={karachi} client={client} />);
    await waitFor(() => {
      expect(card()).not.toHaveAttribute('aria-busy');
    });

    act(() => {
      setUnitSystem('imperial');
    });

    const current = within(card());
    expect(current.getByText('79°')).toBeInTheDocument();
    expect(current.getByText('79 degrees Fahrenheit')).toBeInTheDocument();
    expect(current.getByText(/Feels like 79° · High 84° · Low 79°/)).toBeInTheDocument();
    expect(current.getByText(/3 mph/)).toBeInTheDocument();
    expect(document.title).toBe('Karachi 79° · WeatherBoard');
    expect(client).toHaveBeenCalledTimes(1);
  });

  it('starts in Fahrenheit for a US browser and Celsius otherwise', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);

    expect((await screen.findAllByText('79°')).length).toBeGreaterThan(0);
  });
});

describe('failure with nothing saved', () => {
  it('explains what failed and retries on request', async () => {
    const client = rejected(new AppError('provider-down', 'weather'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithProviders(<View city={karachi} client={client} />);

    // A server error is retried once before it is reported.
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('Both weather sources are unavailable');
    expect(alert).toHaveTextContent(/try again shortly/);
    expect(screen.getByRole('heading', { name: 'Karachi' })).toBeInTheDocument();
    expect(screen.queryByTestId('current-conditions')).not.toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Weather unavailable');
    expect(document.title).toBe('WeatherBoard');

    client.mockResolvedValueOnce(karachiSnapshot);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('current-conditions')).toBeInTheDocument();
  });

  it('offers no retry when retrying cannot help', async () => {
    renderWithProviders(
      <View city={karachi} client={rejected(new AppError('not-found', 'weather'))} />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No weather data for this place');
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('failure with a saved copy of the same city', () => {
  it('shows the saved weather with when it is from, why it is stale, and a retry', async () => {
    const client = rejected(new AppError('offline', 'weather'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithProviders(<View city={karachi} client={client} saved={karachiSnapshot} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Showing data from \d{1,2}:\d{2}/);
    expect(alert).toHaveTextContent('Couldn’t refresh: You are offline.');
    expect(within(card()).getByText('26°')).toBeInTheDocument();
    expect(screen.getByTestId('forecast')).toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Could not refresh · saved');
    expect(document.title).toBe('Karachi 26° · WeatherBoard');

    client.mockResolvedValueOnce(karachiBackupSnapshot);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(within(card()).getByText('25°')).toBeInTheDocument();
  });
});

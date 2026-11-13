import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WeatherClient } from '@/api/weather/weatherClient';
import { DashboardGrid } from '@/app/DashboardGrid';
import { AppError } from '@/domain/errors';
import type { City, WeatherSnapshot } from '@/domain/weather';
import { favouritesStore } from '@/features/favourites/favouritesStore';
import { resetUnitsForTests, setUnitSystem } from '@/features/prefs/units';
import type { OfflineStore } from '@/lib/offlineStore';
import { renderWithProviders } from '@/test/render';
import { karachi, karachiBackupSnapshot, karachiSnapshot, RECORDED_AT } from '@/test/weather';
import { resetAnnouncerForTests } from '@/ui/announce';
import { Announcer } from '@/ui/Announcer';
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
  onOpenCity,
}: {
  city: City | null;
  client: WeatherClient;
  saved?: WeatherSnapshot;
  onOpenCity?: (city: City) => void;
}) {
  const view = useWeatherView(city, {
    deps: { client, store: store(saved ?? null) },
    ...(onOpenCity && { onOpenCity }),
  });
  return (
    <>
      <header>
        {view.status}
        {view.refresh && (
          <button type="button" disabled={view.refresh.disabled} onClick={view.refresh.onClick}>
            Refresh weather
          </button>
        )}
      </header>
      {view.offlineMessage !== null && <p data-testid="offline-banner">{view.offlineMessage}</p>}
      {view.primary && <DashboardGrid primary={view.primary} quick={null} secondary={null} />}
      <LiveRegion message={view.announcement} />
      <Announcer />
    </>
  );
}

const resolved = (snapshot: WeatherSnapshot) =>
  vi.fn<WeatherClient>(() => Promise.resolve(snapshot));
const rejected = (error: AppError) => vi.fn<WeatherClient>(() => Promise.reject(error));
const card = () => screen.getByTestId('current-conditions');

beforeEach(() => {
  window.localStorage.clear();
  favouritesStore.reload();
  resetUnitsForTests();
  resetAnnouncerForTests();
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
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(
        'Karachi: 26 degrees Celsius, Fog.',
      );
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
    const client = rejected(new AppError('rate-limited', 'weather'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithProviders(<View city={karachi} client={client} saved={karachiSnapshot} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Showing data from \d{1,2}:\d{2}/);
    expect(alert).toHaveTextContent('Couldn\u2019t refresh: Too many requests to the weather.');
    expect(within(card()).getByText('26°')).toBeInTheDocument();
    expect(screen.getByTestId('forecast')).toBeInTheDocument();
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Could not refresh · saved');
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    expect(document.title).toBe('Karachi 26° · WeatherBoard');

    client.mockResolvedValueOnce(karachiBackupSnapshot);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(within(card()).getByText('25°')).toBeInTheDocument();
  });
});

describe('offline mode', () => {
  const goOffline = () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
  };
  const goOnline = () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  };
  const offlineError = () => rejected(new AppError('offline', 'weather'));

  it('shows the saved city plainly: its age, no alarm, and nothing to retry', async () => {
    goOffline();
    renderWithProviders(<View city={karachi} client={offlineError()} saved={karachiSnapshot} />);

    expect(await within(card()).findByText('26°')).toBeInTheDocument();
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(
      /^Showing Karachi as saved at \d{1,2}:\d{2}.*\. Search and other cities need a connection\.$/,
    );
    expect(screen.getByTestId('weather-status')).toHaveTextContent('Offline · saved just now');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeDisabled();
  });

  it('treats a request that failed for lack of a connection the same way, whatever the browser claims', async () => {
    renderWithProviders(<View city={karachi} client={offlineError()} saved={karachiSnapshot} />);

    expect(await screen.findByTestId('offline-banner')).toHaveTextContent(
      'Showing Karachi as saved',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes by itself when the connection returns, and says so politely', async () => {
    goOffline();
    const client = offlineError();
    renderWithProviders(<View city={karachi} client={client} saved={karachiSnapshot} />);
    // Wait for the saved weather itself: the banner alone appears before the request has failed.
    expect(await within(card()).findByText('26°')).toBeInTheDocument();
    expect(client).toHaveBeenCalledTimes(1);

    client.mockResolvedValueOnce(karachiBackupSnapshot);
    act(() => {
      goOnline();
    });

    await waitFor(() => {
      expect(client).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    });
    expect(within(card()).getByText('25°')).toBeInTheDocument();
    expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(
      'Back online. Updating the weather.',
    );
    expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeEnabled();
  });

  it('keeps the saved weather on screen while the retry is in flight, with no skeleton', async () => {
    goOffline();
    let release: (snapshot: WeatherSnapshot) => void = () => undefined;
    const client = vi
      .fn<WeatherClient>()
      .mockRejectedValueOnce(new AppError('offline', 'weather'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    renderWithProviders(<View city={karachi} client={client} saved={karachiSnapshot} />);
    expect(await within(card()).findByText('26°')).toBeInTheDocument();

    act(() => {
      goOnline();
    });
    await waitFor(() => {
      expect(client).toHaveBeenCalledTimes(2);
    });

    // Still the saved 26°, not a loading placeholder.
    expect(card()).not.toHaveAttribute('aria-busy');
    expect(within(card()).getByText('26°')).toBeInTheDocument();

    await act(async () => {
      release(karachiBackupSnapshot);
      await Promise.resolve();
    });
    expect(await within(card()).findByText('25°')).toBeInTheDocument();
  });

  it('for a city that is not the saved one: says which city is kept, and offers it', async () => {
    goOffline();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const onOpenCity = vi.fn();
    const lahore: City = { ...karachi, id: 'PK:31.42,74.33', name: 'Lahore', region: 'Punjab' };
    renderWithProviders(
      <View
        city={lahore}
        client={offlineError()}
        saved={karachiSnapshot}
        onOpenCity={onOpenCity}
      />,
    );

    expect(
      await screen.findByText(/Only the last city you viewed is kept for offline use/),
    ).toHaveTextContent('that is Karachi. Lahore will load when you are back online.');
    expect(screen.getByRole('heading', { name: 'Lahore' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('current-conditions')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show Karachi' }));

    expect(onOpenCity).toHaveBeenCalledExactlyOnceWith(karachi);
  });

  it('with nothing saved: says so and what to do', async () => {
    goOffline();
    renderWithProviders(<View city={karachi} client={offlineError()} />);

    expect(await screen.findByText(/Nothing has been saved for offline use yet/)).toHaveTextContent(
      'Reconnect and open a city once',
    );
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(
      'Search and new weather need a connection.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('on a cold start with no remembered city, opens the saved one', async () => {
    goOffline();
    const onOpenCity = vi.fn();
    renderWithProviders(
      <View city={null} client={offlineError()} saved={karachiSnapshot} onOpenCity={onOpenCity} />,
    );

    await waitFor(() => {
      expect(onOpenCity).toHaveBeenCalledWith(karachi);
    });
  });

  it('does not open anything on a cold start while online', async () => {
    const onOpenCity = vi.fn();
    renderWithProviders(
      <View city={null} client={offlineError()} saved={karachiSnapshot} onOpenCity={onOpenCity} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onOpenCity).not.toHaveBeenCalled();
  });
});

describe('an old saved snapshot', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('labels days from their own dates and drops the ones already over', async () => {
    // Two days after the snapshot was taken: 16 Nov in Karachi.
    vi.setSystemTime(RECORDED_AT + 2 * DAY);
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);

    const rows = within(await screen.findByTestId('forecast')).getAllByRole('listitem');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Today');
    // 16 Nov was a full day in the snapshot, so it is not marked partial.
    expect(rows[0]).not.toHaveTextContent('(rest of day)');
    expect(rows[1]).toHaveTextContent('Tuesday');
    expect(rows[2]).toHaveTextContent('Wednesday');
    expect(screen.queryByText('Saturday')).not.toBeInTheDocument();
    // The card's high and low are today's, not the first stored day's.
    expect(within(card()).getByText(/High 30° · Low 26°/)).toBeInTheDocument();
  });

  it('says the forecast has run out when every stored day is over', async () => {
    vi.setSystemTime(RECORDED_AT + 10 * DAY);
    renderWithProviders(<View city={karachi} client={resolved(karachiSnapshot)} />);

    expect(await screen.findByText(/The saved forecast has run out/)).toBeInTheDocument();
    expect(screen.queryByTestId('forecast')).not.toBeInTheDocument();
    expect(within(card()).getByText(/^Feels like 26°$/)).toBeInTheDocument();
  });
});

describe('refresh', () => {
  it('fetches again on request, and is unavailable while loading', async () => {
    const client = resolved(karachiSnapshot);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithProviders(<View city={karachi} client={client} />);
    expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Refresh weather' }));

    await waitFor(() => {
      expect(client).toHaveBeenCalledTimes(2);
    });
  });

  it('is absent when no city is chosen', () => {
    renderWithProviders(<View city={null} client={resolved(karachiSnapshot)} />);

    expect(screen.queryByRole('button', { name: 'Refresh weather' })).not.toBeInTheDocument();
  });
});

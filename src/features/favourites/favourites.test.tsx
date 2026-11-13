import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WeatherClient } from '@/api/weather/weatherClient';
import { AppError } from '@/domain/errors';
import type { City } from '@/domain/weather';
import { resetUnitsForTests } from '@/features/prefs/units';
import type { OfflineStore } from '@/lib/offlineStore';
import { createSafeStorage } from '@/lib/safeStorage';
import { FIVE, honolulu, lahore, longName, snapshotFor, tokyo } from '@/test/favourites';
import { renderWithProviders } from '@/test/render';
import { karachi } from '@/test/weather';
import { resetAnnouncerForTests } from '@/ui/announce';
import { Announcer } from '@/ui/Announcer';
import { FavouritesPanel } from './FavouritesPanel';
import { createFavouritesStore, type FavouritesStore } from './favouritesStore';
import { LIMIT_MESSAGE, useFavouriteControl } from './useFavouriteControl';

function storeWith(cities: City[]): FavouritesStore {
  window.localStorage.clear();
  const store = createFavouritesStore(createSafeStorage(() => window.localStorage));
  for (const city of cities) store.add(city);
  return store;
}

const offlineStore: OfflineStore = {
  write: () => Promise.resolve(),
  read: () => Promise.resolve(null),
};
const working: WeatherClient = (city) => Promise.resolve(snapshotFor(city));

function Star({ city, store }: { city: City; store: FavouritesStore }) {
  const { action, notice } = useFavouriteControl(city, store);
  return (
    <>
      {action}
      {notice}
      <Announcer />
    </>
  );
}

function renderPanel(
  store: FavouritesStore,
  options: { current?: City; client?: WeatherClient; onSelect?: (city: City) => void } = {},
) {
  return renderWithProviders(
    <>
      <FavouritesPanel
        store={store}
        currentCityId={options.current?.id ?? null}
        onSelect={options.onSelect ?? (() => undefined)}
        weatherDeps={{ client: options.client ?? working, store: offlineStore }}
      />
      <Announcer />
    </>,
  );
}

const panel = () => within(screen.getByTestId('favourites'));
const row = (name: string) => panel().getByRole('button', { name: new RegExp(`^${name}`) });
const announced = () => screen.getByRole('status');

beforeEach(() => {
  resetAnnouncerForTests();
  resetUnitsForTests();
});

describe('star on the conditions card', () => {
  it('saves the city, shows as pressed and announces the new count', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, tokyo]);
    renderWithProviders(<Star city={lahore} store={store} />);
    const star = screen.getByRole('button', { name: 'Save Lahore as a favourite' });
    expect(star).toHaveAttribute('aria-pressed', 'false');

    await user.click(star);

    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(store.getState().cities.map((city) => city.name)).toEqual([
      'Karachi',
      'Tokyo',
      'Lahore',
    ]);
    expect(announced()).toHaveTextContent('Lahore saved. 3 of 5 favourites.');
  });

  it('at the limit: stays focusable, shows why, and refuses out loud rather than silently', async () => {
    const user = userEvent.setup();
    const store = storeWith(FIVE);
    renderWithProviders(<Star city={honolulu} store={store} />);
    const star = screen.getByRole('button', { name: 'Save Honolulu as a favourite' });

    const reason = screen.getByText(LIMIT_MESSAGE);
    expect(reason).toBeVisible();
    expect(LIMIT_MESSAGE).toBe('You’ve saved 5 of 5 cities. Remove one to add another.');
    expect(star).toHaveAttribute('aria-disabled', 'true');
    expect(star).toHaveAttribute('aria-describedby', reason.id);
    expect(star).not.toBeDisabled();

    await user.tab();
    expect(star).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(store.getState().cities).toHaveLength(5);
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(announced()).toHaveTextContent(LIMIT_MESSAGE);
  });

  it('has no limit message for a city that is already one of the five', () => {
    renderWithProviders(<Star city={karachi} store={storeWith(FIVE)} />);

    expect(screen.queryByText(LIMIT_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Karachi/ })).not.toHaveAttribute('aria-disabled');
  });

  it('on a saved city: asks first, starting on the safe answer', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi]);
    renderWithProviders(<Star city={karachi} store={store} />);

    await user.click(screen.getByRole('button', { name: 'Save Karachi as a favourite' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Karachi from favourites?' });
    expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveFocus();
    expect(store.getState().cities).toHaveLength(1);
  });

  it('cancelling with Escape keeps the city and returns focus to the star', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi]);
    renderWithProviders(<Star city={karachi} store={store} />);
    const star = screen.getByRole('button', { name: 'Save Karachi as a favourite' });
    await user.click(star);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(store.getState().cities).toHaveLength(1);
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(star).toHaveFocus();
    });
  });

  it('confirming removes the city, announces it and returns focus to the star', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, tokyo]);
    renderWithProviders(<Star city={karachi} store={store} />);
    const star = screen.getByRole('button', { name: 'Save Karachi as a favourite' });
    await user.click(star);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(store.getState().cities.map((city) => city.name)).toEqual(['Tokyo']);
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(announced()).toHaveTextContent('Karachi removed. 1 of 5 favourites.');
    await waitFor(() => {
      expect(star).toHaveFocus();
    });
  });
});

describe('quick-access panel', () => {
  it('shows the count, and each city with its place and current temperature', async () => {
    renderPanel(storeWith([karachi, lahore, tokyo]));

    expect(panel().getByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
    expect(panel().getByText('3 of 5 saved')).toBeInTheDocument();
    expect(panel().getAllByRole('listitem')).toHaveLength(3);
    expect(row('Lahore')).toHaveTextContent('Punjab, Pakistan');
    await waitFor(() => {
      expect(row('Lahore')).toHaveTextContent('26 degrees Celsius, Fog');
    });
    expect(
      panel().getByRole('button', { name: 'Remove Lahore from favourites' }),
    ).toBeInTheDocument();
  });

  it('marks the row of the city on screen', () => {
    renderPanel(storeWith([karachi, lahore]), { current: lahore });

    expect(row('Lahore')).toHaveAttribute('aria-current', 'true');
    expect(row('Karachi')).not.toHaveAttribute('aria-current');
  });

  it('opens a city when its row is activated', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderPanel(storeWith([karachi, lahore]), { onSelect });

    await user.click(row('Lahore'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(lahore);
  });

  it('shows a skeleton for a row that is still loading', () => {
    const pending: WeatherClient = () => new Promise(() => undefined);
    renderPanel(storeWith([karachi]), { client: pending });

    expect(row('Karachi')).toHaveTextContent('Loading temperature');
  });

  it('shows a dash for a row that cannot load, with no error banner, and keeps the rest working', async () => {
    const client: WeatherClient = (city) =>
      city.id === lahore.id
        ? Promise.reject(new AppError('offline', 'weather'))
        : Promise.resolve(snapshotFor(city));
    renderPanel(storeWith([karachi, lahore, tokyo]), { client });

    await waitFor(() => {
      expect(row('Lahore')).toHaveTextContent('Temperature unavailable');
    });
    expect(row('Lahore')).toHaveTextContent('–');
    expect(row('Karachi')).toHaveTextContent('26°');
    expect(row('Tokyo')).toHaveTextContent('26°');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(panel().getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps a long name whole for assistive technology and in a tooltip', () => {
    renderPanel(storeWith([longName]));

    const name = panel().getByText('Thiruvananthapuram');
    expect(name).toHaveClass('truncate');
    expect(name).toHaveAttribute('title', 'Thiruvananthapuram');
    expect(row('Thiruvananthapuram')).toBeInTheDocument();
  });

  it('says how to add a city when the list is empty', () => {
    renderPanel(storeWith([]));

    expect(
      panel().getByText('Tap the star on a city to keep it here, one tap away.'),
    ).toBeVisible();
    expect(panel().getByText('0 of 5 saved')).toBeInTheDocument();
    expect(panel().queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    // Narrower than 768px: the panel renders its compact form.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows each saved city as a tap target with its temperature, and no remove buttons', async () => {
    renderPanel(storeWith([karachi, lahore, longName]), { current: lahore });

    expect(panel().getAllByRole('listitem')).toHaveLength(3);
    await waitFor(() => {
      expect(row('Lahore')).toHaveTextContent('26 degrees Celsius, Fog');
    });
    expect(row('Lahore')).toHaveAttribute('aria-current', 'true');
    expect(row('Karachi')).not.toHaveAttribute('aria-current');
    expect(panel().getByText('Thiruvananthapuram')).toHaveAttribute('title', 'Thiruvananthapuram');
    expect(panel().queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(panel().getByText('3 of 5 saved')).toBeInTheDocument();
  });

  it('switches city in one tap', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderPanel(storeWith([karachi, lahore]), { onSelect });

    await user.click(row('Lahore'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(lahore);
  });

  it('Edit swaps in the full list with remove buttons, and Done puts the tap targets back', async () => {
    const user = userEvent.setup();
    renderPanel(storeWith([karachi, lahore]));
    const edit = panel().getByRole('button', { name: 'Edit' });
    expect(edit).toHaveAttribute('aria-pressed', 'false');

    await user.click(edit);

    expect(panel().getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      panel().getByRole('button', { name: 'Remove Lahore from favourites' }),
    ).toBeInTheDocument();
    expect(row('Lahore')).toHaveTextContent('Punjab, Pakistan');

    await user.click(panel().getByRole('button', { name: 'Done' }));

    expect(panel().queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('has no Edit button when nothing is saved', () => {
    renderPanel(storeWith([]));

    expect(panel().queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('removing from the panel', () => {
  const openRemove = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(panel().getByRole('button', { name: `Remove ${name} from favourites` }));
    return screen.getByRole('alertdialog', { name: `Remove ${name} from favourites?` });
  };

  it('asks first, naming the city, with focus on the safe answer', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, lahore]);
    renderPanel(store);

    const dialog = await openRemove(user, 'Lahore');

    expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveFocus();
    expect(store.getState().cities).toHaveLength(2);
  });

  it('cancel keeps the city and returns focus to the button that asked', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, lahore]);
    renderPanel(store);
    const dialog = await openRemove(user, 'Lahore');

    await user.click(within(dialog).getByRole('button', { name: 'Keep' }));

    expect(store.getState().cities).toHaveLength(2);
    await waitFor(() => {
      expect(panel().getByRole('button', { name: 'Remove Lahore from favourites' })).toHaveFocus();
    });
  });

  it('Escape cancels too', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, lahore]);
    renderPanel(store);
    await openRemove(user, 'Lahore');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(store.getState().cities).toHaveLength(2);
  });

  it('after removal, focus moves to the next row and the result is announced', async () => {
    const user = userEvent.setup();
    const store = storeWith([karachi, lahore, tokyo]);
    renderPanel(store);
    const dialog = await openRemove(user, 'Lahore');

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(store.getState().cities.map((city) => city.name)).toEqual(['Karachi', 'Tokyo']);
    expect(announced()).toHaveTextContent('Lahore removed. 2 of 5 favourites.');
    await waitFor(() => {
      expect(row('Tokyo')).toHaveFocus();
    });
  });

  it('after removing the last row, focus moves to the row above', async () => {
    const user = userEvent.setup();
    renderPanel(storeWith([karachi, lahore, tokyo]));
    const dialog = await openRemove(user, 'Tokyo');

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(row('Lahore')).toHaveFocus();
    });
  });

  it('after removing the only favourite, focus moves to the panel heading', async () => {
    const user = userEvent.setup();
    renderPanel(storeWith([karachi]));
    const dialog = await openRemove(user, 'Karachi');

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(panel().getByRole('heading', { name: 'Favourites' })).toHaveFocus();
    });
    expect(panel().getByText(/Tap the star on a city/)).toBeVisible();
  });
});

import { useId, useRef, useState } from 'react';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { formatTemperature, TEMPERATURE_UNIT } from '@/domain/units';
import type { City } from '@/domain/weather';
import { useUnits } from '@/features/prefs/units';
import { useWeather } from '@/features/weather/useWeather';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { cx } from '@/ui/cx';
import { IconButton } from '@/ui/IconButton';
import { Skeleton } from '@/ui/Skeleton';
import { WeatherIcon } from '@/ui/WeatherIcon';
import {
  favouritesStore,
  MAX_FAVOURITES,
  useFavourites,
  type FavouritesStore,
} from './favouritesStore';
import { RemoveFavouriteDialog } from './RemoveFavouriteDialog';

type WeatherDeps = Parameters<typeof useWeather>[1];

/**
 * A favourite's weather, from the same query the card uses, so opening it is
 * instant. A city that cannot load is simply "unavailable": one city's
 * failure is not the list's problem.
 */
function useFavouriteWeather(city: City, weatherDeps: WeatherDeps) {
  const units = useUnits();
  const weather = useWeather(city, weatherDeps, { offline: false });
  const snapshot =
    weather.status === 'success'
      ? weather.snapshot
      : weather.status === 'error'
        ? weather.saved
        : null;
  return { units, snapshot, loading: weather.status === 'loading' };
}

/** The temperature, a skeleton while it loads, or a dash with spoken text if it cannot. */
function Temperature({ city, weatherDeps }: { city: City; weatherDeps: WeatherDeps }) {
  const { units, snapshot, loading } = useFavouriteWeather(city, weatherDeps);
  if (snapshot) {
    const temperature = formatTemperature(snapshot.current.temperatureC, units);
    return (
      <>
        <span aria-hidden="true">{temperature}</span>
        <span className="sr-only">
          {temperature.replace('°', '')} degrees {TEMPERATURE_UNIT[units].name},{' '}
          {conditionLabel(snapshot.current.condition)}
        </span>
      </>
    );
  }
  if (loading) {
    return (
      <>
        <Skeleton className="h-4 w-7" />
        <span className="sr-only">Loading temperature</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true" className="text-muted">
        –
      </span>
      <span className="sr-only">Temperature unavailable</span>
    </>
  );
}

type ItemProps = {
  city: City;
  current: boolean;
  onSelect: (city: City) => void;
  weatherDeps: WeatherDeps;
};

/** A favourite as one compact tap target: switching city is the frequent action. */
function Chip({ city, current, onSelect, weatherDeps }: ItemProps) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          onSelect(city);
        }}
        className={cx(
          'hover:bg-hover flex h-11 w-full min-w-0 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors',
          current ? 'bg-hover border-line-strong' : 'border-line',
        )}
      >
        {/* Cut short on screen when long; assistive technology still gets the whole name. */}
        <span className="min-w-0 flex-1 truncate font-medium" title={city.name}>
          {city.name}
        </span>
        <span className="shrink-0 font-medium">
          <Temperature city={city} weatherDeps={weatherDeps} />
        </span>
      </button>
    </li>
  );
}

type RowProps = ItemProps & {
  onRemove: (city: City) => void;
  registerSelect: (cityId: string, element: HTMLButtonElement | null) => void;
};

/** A favourite in the full list: icon, place, temperature, and its remove button. */
function Row({ city, current, onSelect, onRemove, registerSelect, weatherDeps }: RowProps) {
  const { snapshot, loading } = useFavouriteWeather(city, weatherDeps);

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        ref={(element) => {
          registerSelect(city.id, element);
        }}
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          onSelect(city);
        }}
        className={cx(
          'hover:bg-hover flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
          current && 'bg-hover',
        )}
      >
        <span className="size-6 shrink-0">
          {snapshot ? (
            <WeatherIcon condition={snapshot.current.condition} className="size-full" />
          ) : (
            loading && <Skeleton className="size-full rounded-full" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={city.name}>
            {city.name}
          </span>
          <span className="text-muted block truncate text-xs">{cityContext(city)}</span>
        </span>
        <span className="shrink-0 text-sm font-medium">
          <Temperature city={city} weatherDeps={weatherDeps} />
        </span>
      </button>
      <IconButton
        label={`Remove ${city.name} from favourites`}
        icon="close"
        onClick={() => {
          onRemove(city);
        }}
      />
    </li>
  );
}

type FavouritesPanelProps = {
  /** The city on screen, to mark its entry. */
  currentCityId: string | null;
  onSelect: (city: City) => void;
  store?: FavouritesStore;
  weatherDeps?: WeatherDeps;
};

/**
 * Saved cities, one tap away.
 *
 * On a phone the panel sits above the weather, so it is kept short: the
 * cities are compact tap targets, two to a row, because switching city is the
 * frequent action. Removing is the rare one and lives behind "Edit", which
 * swaps in the full list with its remove buttons. From 768px the full list is
 * always shown in the side column.
 */
export function FavouritesPanel({
  currentCityId,
  onSelect,
  store = favouritesStore,
  weatherDeps,
}: FavouritesPanelProps) {
  const { cities } = useFavourites(store);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<City | null>(null);
  // Decides what is rendered, not only how it looks, so it cannot be left to CSS.
  const wide = useMediaQuery('(min-width: 48rem)', true);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectButtons = useRef(new Map<string, HTMLButtonElement>());
  /** Where focus should land once a removal's dialog has closed. */
  const focusAfterRemoval = useRef<{ rowId: string } | 'heading' | null>(null);

  const count = cities.length;
  const showList = wide || editing;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="favourites"
      className="border-line bg-surface rounded-lg border p-2 md:p-3"
    >
      <div className="flex min-h-11 items-center gap-2 px-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-muted text-sm font-medium outline-none"
        >
          Favourites
        </h2>
        <p className="text-subtle text-xs">
          <span aria-hidden="true">
            {count} of {MAX_FAVOURITES}
          </span>
          <span className="sr-only">
            {count} of {MAX_FAVOURITES} saved
          </span>
        </p>
        {count > 0 && !wide && (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => {
              setEditing((on) => !on);
            }}
            className="text-ink hover:bg-hover -mr-2 ml-auto inline-flex h-11 items-center rounded-md px-3 text-sm font-medium"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {count === 0 ? (
        <p className="text-muted px-2 pb-2 text-sm">
          Tap the star on a city to keep it here, one tap away.
        </p>
      ) : showList ? (
        <ul className="flex flex-col gap-0.5">
          {cities.map((city) => (
            <Row
              key={city.id}
              city={city}
              current={city.id === currentCityId}
              onSelect={onSelect}
              onRemove={setRemoving}
              registerSelect={(cityId, element) => {
                if (element) selectButtons.current.set(cityId, element);
                else selectButtons.current.delete(cityId);
              }}
              weatherDeps={weatherDeps}
            />
          ))}
        </ul>
      ) : (
        // Two to a row with names cut short as needed: five cities take three rows at most.
        <ul className="grid grid-cols-2 gap-1.5 px-1 pb-1">
          {cities.map((city) => (
            <Chip
              key={city.id}
              city={city}
              current={city.id === currentCityId}
              onSelect={onSelect}
              weatherDeps={weatherDeps}
            />
          ))}
        </ul>
      )}

      <RemoveFavouriteDialog
        city={removing}
        store={store}
        onClose={() => {
          setRemoving(null);
        }}
        onRemoved={(removed) => {
          // The next row takes the removed one's place; the last row hands over to the one above.
          const index = cities.findIndex((entry) => entry.id === removed.id);
          const neighbour = cities[index + 1] ?? cities[index - 1];
          focusAfterRemoval.current = neighbour ? { rowId: neighbour.id } : 'heading';
        }}
        onCloseAutoFocus={(event) => {
          const target = focusAfterRemoval.current;
          focusAfterRemoval.current = null;
          // Cancelled: the default returns focus to the button that opened the dialog.
          if (target === null) return;
          event.preventDefault();
          if (target === 'heading') headingRef.current?.focus();
          else selectButtons.current.get(target.rowId)?.focus();
        }}
      />
    </section>
  );
}

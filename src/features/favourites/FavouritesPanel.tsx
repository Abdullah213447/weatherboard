import { useId, useRef, useState } from 'react';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { formatTemperature, TEMPERATURE_UNIT } from '@/domain/units';
import type { City } from '@/domain/weather';
import { useUnits } from '@/features/prefs/units';
import { useWeather } from '@/features/weather/useWeather';
import { cx } from '@/ui/cx';
import { Icon } from '@/ui/Icon';
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

type RowProps = {
  city: City;
  current: boolean;
  onSelect: (city: City) => void;
  onRemove: (city: City) => void;
  registerSelect: (cityId: string, element: HTMLButtonElement | null) => void;
  weatherDeps: WeatherDeps;
};

/**
 * One favourite. Its temperature comes from the same query the card uses, so
 * opening it is instant. A row that cannot load shows a dash and nothing
 * more: one city's failure is not the list's problem.
 */
function Row({ city, current, onSelect, onRemove, registerSelect, weatherDeps }: RowProps) {
  const units = useUnits();
  const weather = useWeather(city, weatherDeps, { offline: false });
  const snapshot =
    weather.status === 'success'
      ? weather.snapshot
      : weather.status === 'error'
        ? weather.saved
        : null;

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
            weather.status === 'loading' && <Skeleton className="size-full rounded-full" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          {/* Cut short on screen when long; assistive technology still gets the whole name. */}
          <span className="block truncate text-sm font-medium" title={city.name}>
            {city.name}
          </span>
          <span className="text-muted block truncate text-xs">{cityContext(city)}</span>
        </span>
        <span className="shrink-0 text-sm font-medium">
          {snapshot ? (
            <>
              <span aria-hidden="true">
                {formatTemperature(snapshot.current.temperatureC, units)}
              </span>
              <span className="sr-only">
                {formatTemperature(snapshot.current.temperatureC, units).replace('°', '')} degrees{' '}
                {TEMPERATURE_UNIT[units].name}, {conditionLabel(snapshot.current.condition)}
              </span>
            </>
          ) : weather.status === 'loading' ? (
            <>
              <Skeleton className="h-4 w-7" />
              <span className="sr-only">Loading temperature</span>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="text-muted">
                –
              </span>
              <span className="sr-only">Temperature unavailable</span>
            </>
          )}
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
  /** The city on screen, to mark its row. */
  currentCityId: string | null;
  onSelect: (city: City) => void;
  store?: FavouritesStore;
  weatherDeps?: WeatherDeps;
};

/**
 * Saved cities, one tap away. On a phone the list is folded behind its
 * heading so the current temperature stays on the first screen; from 768px it
 * is always open in the side column.
 */
export function FavouritesPanel({
  currentCityId,
  onSelect,
  store = favouritesStore,
  weatherDeps,
}: FavouritesPanelProps) {
  const { cities } = useFavourites(store);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<City | null>(null);
  const headingId = useId();
  const listId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectButtons = useRef(new Map<string, HTMLButtonElement>());
  /** Where focus should land once a removal's dialog has closed. */
  const focusAfterRemoval = useRef<{ rowId: string } | 'heading' | null>(null);

  const count = cities.length;

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
        {count > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => {
              setExpanded((open) => !open);
            }}
            className="text-ink hover:bg-hover -mr-2 ml-auto inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium md:hidden"
          >
            {expanded ? 'Hide' : 'Show'}
            <Icon
              name="chevron"
              size={16}
              className={cx('transition-transform', expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {count === 0 ? (
        <p className="text-muted px-2 pb-2 text-sm">
          Tap the star on a city to keep it here, one tap away.
        </p>
      ) : (
        <ul id={listId} className={cx('flex-col gap-0.5 md:flex', expanded ? 'flex' : 'hidden')}>
          {cities.map((city) => (
            <Row
              key={city.id}
              city={city}
              current={city.id === currentCityId}
              onSelect={(chosen) => {
                setExpanded(false);
                onSelect(chosen);
              }}
              onRemove={setRemoving}
              registerSelect={(cityId, element) => {
                if (element) selectButtons.current.set(cityId, element);
                else selectButtons.current.delete(cityId);
              }}
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

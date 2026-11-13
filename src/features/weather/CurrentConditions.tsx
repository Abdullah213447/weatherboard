import { useId, type ReactNode } from 'react';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { formatLocalDate, formatLocalTime, localDateKey } from '@/domain/time';
import {
  compassPoint,
  formatTemperature,
  formatWindSpeed,
  TEMPERATURE_UNIT,
  type UnitSystem,
} from '@/domain/units';
import type { City, WeatherSnapshot } from '@/domain/weather';
import type { FavouritesStore } from '@/features/favourites/favouritesStore';
import { useFavouriteControl } from '@/features/favourites/useFavouriteControl';
import { UnitToggle } from '@/features/prefs/UnitToggle';
import { cx } from '@/ui/cx';
import { Icon } from '@/ui/Icon';
import { Skeleton } from '@/ui/Skeleton';
import { WeatherIcon } from '@/ui/WeatherIcon';
import { skyScope } from './skyTint';

const METRIC_LABELS = ['Humidity', 'Wind', 'Chance of rain', 'Sunrise', 'Sunset'] as const;

/** Holds a line's height while its text is missing: as tall as the text will be. */
function Pending({ width }: { width: string }) {
  return <Skeleton className={cx('inline-block h-[0.75em] align-middle', width)} />;
}

/** A value that has just arrived: fades in over the motion token, or simply appears. */
function Arrived({ children }: { children: ReactNode }) {
  return <span className="motion-safe:animate-fade-in">{children}</span>;
}

type CurrentConditionsProps = {
  city: City;
  /** Null while the first load is in flight: the card shows its skeleton. */
  snapshot: WeatherSnapshot | null;
  units: UnitSystem;
  /** Epoch milliseconds, for the city's clock. */
  now: number;
  /** Replaceable in tests. */
  favourites?: FavouritesStore;
};

/**
 * The sky-tinted card: where the city is, what it is like there now, and
 * today's range.
 *
 * One component renders both the skeleton and the loaded card, in the same
 * elements. So nothing moves when the data arrives; the tint and the values
 * fade in over the motion token instead (and simply appear when the user
 * prefers reduced motion).
 */
export function CurrentConditions({
  city,
  snapshot,
  units,
  now,
  favourites,
}: CurrentConditionsProps) {
  const headingId = useId();
  // The star, and the reason it cannot be used when the list is full.
  const { action, notice } = useFavouriteControl(city, favourites);
  const scope = snapshot ? skyScope(snapshot.current.condition) : null;
  const unit = TEMPERATURE_UNIT[units];

  const value = (render: (loaded: WeatherSnapshot) => ReactNode, pendingWidth: string) =>
    snapshot ? <Arrived>{render(snapshot)}</Arrived> : <Pending width={pendingWidth} />;
  const time = (loaded: WeatherSnapshot, instant: number) =>
    formatLocalTime(instant, loaded.utcOffsetSeconds);
  /** Today's forecast entry by date, so an old saved snapshot never passes off a past day as today. */
  const todayOf = (loaded: WeatherSnapshot) => {
    const key = localDateKey(now, loaded.utcOffsetSeconds);
    return loaded.daily.find((day) => day.date === key);
  };

  const metrics: Record<(typeof METRIC_LABELS)[number], (loaded: WeatherSnapshot) => ReactNode> = {
    Humidity: ({ current }) => `${String(Math.round(current.humidityPct))}%`,
    Wind: ({ current }) => (
      <span className="inline-flex items-center gap-1.5">
        {formatWindSpeed(current.windSpeedMs, units)}
        {current.windDirectionDeg !== undefined && (
          <>
            {/* The bearing says where the wind comes from; the arrow shows where it is going. */}
            <span
              aria-hidden="true"
              className="inline-flex"
              style={{ transform: `rotate(${String(current.windDirectionDeg + 180)}deg)` }}
            >
              <Icon name="arrow" size={14} />
            </span>
            <span>
              <span className="sr-only">from the </span>
              {compassPoint(current.windDirectionDeg)}
            </span>
          </>
        )}
      </span>
    ),
    'Chance of rain': (loaded) => {
      const chance = todayOf(loaded)?.precipitationChancePct;
      return chance === undefined ? 'Not reported' : `${String(Math.round(chance))}%`;
    },
    Sunrise: (loaded) => (loaded.sun ? time(loaded, loaded.sun.sunriseAt) : 'None today'),
    Sunset: (loaded) => (loaded.sun ? time(loaded, loaded.sun.sunsetAt) : 'None today'),
  };

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={!snapshot || undefined}
      data-theme={scope?.theme}
      data-testid="current-conditions"
      style={scope ? { backgroundColor: scope.background } : undefined}
      className={cx(
        'border-line text-ink rounded-lg border p-4 transition-colors duration-[var(--wb-duration-base)] md:p-6',
        !scope && 'bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-xl font-semibold" title={city.name}>
            {city.name}
          </h2>
          <p className="text-muted truncate text-sm">{cityContext(city)}</p>
          <p className="text-muted truncate text-sm">
            {value(
              (loaded) => (
                <>
                  <span className="sr-only">Local time </span>
                  <span className="text-ink font-medium">{time(loaded, now)}</span>
                  {' · '}
                  {formatLocalDate(now, loaded.utcOffsetSeconds)}
                </>
              ),
              'w-40',
            )}
          </p>
          {notice}
        </div>
        {action}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <p className="text-display">
          {value((loaded) => {
            const temperature = formatTemperature(loaded.current.temperatureC, units);
            return (
              <>
                <span aria-hidden="true">{temperature}</span>
                <span className="sr-only">
                  {temperature.replace('°', '')} degrees {unit.name}
                </span>
              </>
            );
          }, 'w-[1.6em]')}
        </p>
        {/* Beside the number at every width, so its unit is always in view. */}
        <UnitToggle orientation="vertical" />
        <div className="ml-auto aspect-square w-20 max-w-24 min-w-12 shrink md:w-24">
          {snapshot ? (
            <Arrived>
              <WeatherIcon condition={snapshot.current.condition} className="size-full" />
            </Arrived>
          ) : (
            <Skeleton className="size-full rounded-full" />
          )}
        </div>
      </div>

      <p className="mt-2 text-lg font-medium">
        {value((loaded) => conditionLabel(loaded.current.condition), 'w-28')}
      </p>
      <p className="text-muted text-sm">
        {value((loaded) => {
          const { current } = loaded;
          const today = todayOf(loaded);
          return (
            <>
              Feels like {formatTemperature(current.feelsLikeC, units)}
              {today && (
                <>
                  {' · '}High {formatTemperature(today.maxC, units)}
                  {' · '}Low {formatTemperature(today.minC, units)}
                </>
              )}
            </>
          );
        }, 'w-52')}
      </p>

      <dl className="border-line mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-3">
        {METRIC_LABELS.map((label) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted text-xs">{label}</dt>
            <dd className="truncate text-sm font-medium">{value(metrics[label], 'w-14')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

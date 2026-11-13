import { useId, type ReactNode } from 'react';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { formatLocalDate, formatLocalTime } from '@/domain/time';
import {
  compassPoint,
  formatTemperature,
  formatWindSpeed,
  TEMPERATURE_UNIT,
  type UnitSystem,
} from '@/domain/units';
import type { City, WeatherSnapshot } from '@/domain/weather';
import { cx } from '@/ui/cx';
import { Icon } from '@/ui/Icon';
import { Skeleton } from '@/ui/Skeleton';
import { WeatherIcon } from '@/ui/WeatherIcon';
import { skyScope } from './skyTint';

type Slots = {
  theme?: 'dark' | undefined;
  background?: string | undefined;
  busy?: boolean;
  headingId: string;
  city: City;
  clock: ReactNode;
  date: ReactNode;
  temperature: ReactNode;
  icon: ReactNode;
  condition: ReactNode;
  summary: ReactNode;
  metrics: { label: string; value: ReactNode }[];
};

/**
 * The card's one and only layout. The loaded card and its skeleton both
 * render through it, so the skeleton cannot drift from the real thing and
 * nothing moves when the data arrives.
 */
function Layout({
  theme,
  background,
  busy = false,
  headingId,
  city,
  clock,
  date,
  temperature,
  icon,
  condition,
  summary,
  metrics,
}: Slots) {
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      data-theme={theme}
      data-testid="current-conditions"
      style={background ? { backgroundColor: background } : undefined}
      className={cx(
        'border-line text-ink rounded-lg border p-4 transition-colors md:p-6',
        !background && 'bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-xl font-semibold">
            {city.name}
          </h2>
          <p className="text-muted truncate text-sm">{cityContext(city)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium">{clock}</p>
          <p className="text-muted text-xs">{date}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-display">{temperature}</p>
        <div className="size-20 shrink-0 md:size-24">{icon}</div>
      </div>

      <p className="mt-2 text-lg font-medium">{condition}</p>
      <p className="text-muted text-sm">{summary}</p>

      <dl className="border-line mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-muted text-xs">{metric.label}</dt>
            <dd className="truncate text-sm font-medium">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const METRIC_LABELS = ['Humidity', 'Wind', 'Chance of rain', 'Sunrise', 'Sunset'];

/** Keeps a line's height while its text is missing: the box is as tall as the text would be. */
function Line({ width }: { width: string }) {
  return <Skeleton className={cx('inline-block h-[0.75em] align-middle', width)} />;
}

export function CurrentConditionsSkeleton({ city }: { city: City }) {
  const headingId = useId();
  return (
    <Layout
      busy
      headingId={headingId}
      city={city}
      clock={<Line width="w-10" />}
      date={<Line width="w-24" />}
      temperature={<Line width="w-[1.6em]" />}
      icon={<Skeleton className="size-full rounded-full" />}
      condition={<Line width="w-28" />}
      summary={<Line width="w-52" />}
      metrics={METRIC_LABELS.map((label) => ({ label, value: <Line width="w-14" /> }))}
    />
  );
}

type CurrentConditionsProps = {
  snapshot: WeatherSnapshot;
  units: UnitSystem;
  /** Epoch milliseconds, for the city's clock. */
  now: number;
};

/** The sky-tinted card: where the city is, what it is like there now, and today's range. */
export function CurrentConditions({ snapshot, units, now }: CurrentConditionsProps) {
  const headingId = useId();
  const { city, current, daily, sun, utcOffsetSeconds } = snapshot;
  const [today] = daily;
  const scope = skyScope(current.condition);
  const unit = TEMPERATURE_UNIT[units];
  const temperature = formatTemperature(current.temperatureC, units);
  const time = (instant: number) => formatLocalTime(instant, utcOffsetSeconds);

  return (
    <Layout
      theme={scope.theme}
      background={scope.background}
      headingId={headingId}
      city={city}
      clock={
        <>
          <span className="sr-only">Local time </span>
          {time(now)}
        </>
      }
      date={formatLocalDate(now, utcOffsetSeconds)}
      temperature={
        <>
          <span aria-hidden="true">{temperature}</span>
          <span className="sr-only">
            {temperature.replace('°', '')} degrees {unit.name}
          </span>
        </>
      }
      icon={<WeatherIcon condition={current.condition} className="size-full" />}
      condition={conditionLabel(current.condition)}
      summary={
        <>
          Feels like {formatTemperature(current.feelsLikeC, units)}
          {today && (
            <>
              {' · '}High {formatTemperature(today.maxC, units)}
              {' · '}Low {formatTemperature(today.minC, units)}
            </>
          )}
        </>
      }
      metrics={[
        { label: 'Humidity', value: `${String(Math.round(current.humidityPct))}%` },
        {
          label: 'Wind',
          value: (
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
        },
        {
          label: 'Chance of rain',
          value:
            today?.precipitationChancePct === undefined
              ? 'Not reported'
              : `${String(Math.round(today.precipitationChancePct))}%`,
        },
        { label: 'Sunrise', value: sun ? time(sun.sunriseAt) : 'None today' },
        { label: 'Sunset', value: sun ? time(sun.sunsetAt) : 'None today' },
      ]}
    />
  );
}

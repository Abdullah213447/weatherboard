import type { ReactNode } from 'react';
import { Panel } from '@/app/Panel';
import { conditionLabel } from '@/domain/conditionLabel';
import { MEANINGFUL_CHANCE_PCT, positionOnScale, rangeBars } from '@/domain/forecastRange';
import { dayLabel, localDateKey } from '@/domain/time';
import { formatTemperature, type UnitSystem } from '@/domain/units';
import type { WeatherSnapshot } from '@/domain/weather';
import { Skeleton } from '@/ui/Skeleton';
import { WeatherIcon } from '@/ui/WeatherIcon';

const DAYS = 5;

type RowSlots = {
  day: ReactNode;
  icon: ReactNode;
  condition: ReactNode;
  chance?: ReactNode;
  low: ReactNode;
  bar: ReactNode;
  high: ReactNode;
};

/** One day. Two lines at every width, so nothing is ever squeezed. Shared by the skeleton. */
function Row({ day, icon, condition, chance, low, bar, high }: RowSlots) {
  return (
    <li className="border-line flex flex-col gap-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="size-7 shrink-0">{icon}</div>
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{day}</span>
          <span className="text-muted"> · {condition}</span>
        </p>
        <p className="text-muted shrink-0 text-xs">{chance}</p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted w-9 shrink-0 text-right">{low}</span>
        <div className="bg-hover relative h-1.5 min-w-0 flex-1 rounded-full">{bar}</div>
        <span className="w-9 shrink-0 font-medium">{high}</span>
      </div>
    </li>
  );
}

function Line({ width }: { width: string }) {
  return <Skeleton className={`inline-block h-[0.75em] align-middle ${width}`} />;
}

export function ForecastSkeleton() {
  return (
    <Panel title="5-day forecast">
      <ol aria-busy="true">
        {Array.from({ length: DAYS }, (_, index) => (
          <Row
            key={index}
            day={<Line width="w-16" />}
            icon={<Skeleton className="size-full rounded-full" />}
            condition={<Line width="w-20" />}
            low={<Line width="w-6" />}
            bar={null}
            high={<Line width="w-6" />}
          />
        ))}
      </ol>
    </Panel>
  );
}

type ForecastProps = { snapshot: WeatherSnapshot; units: UnitSystem; now: number };

/**
 * Five days on one shared temperature scale: each bar runs from that day's
 * low to its high, positioned between the coldest low and the warmest high
 * of the whole forecast, so warmer and cooler days are visible at a glance.
 */
export function Forecast({ snapshot, units, now }: ForecastProps) {
  const { daily, current, utcOffsetSeconds } = snapshot;
  const bars = rangeBars(daily);
  const todayKey = localDateKey(now, utcOffsetSeconds);

  return (
    <Panel title="5-day forecast">
      <ol data-testid="forecast">
        {daily.map((day, index) => {
          const bar = bars[index];
          const isFirst = index === 0;
          const chance = day.precipitationChancePct;
          return (
            <Row
              key={day.date}
              day={
                <>
                  {/* The first row is the provider's "today" even if the clock has just passed midnight. */}
                  {isFirst ? 'Today' : dayLabel(day.date, todayKey)}
                  {day.partial && (
                    <span className="text-muted font-normal">
                      {' '}
                      <span aria-hidden="true">(rest of day)</span>
                      <span className="sr-only">, remaining hours only</span>
                    </span>
                  )}
                </>
              }
              icon={<WeatherIcon condition={day.condition} className="size-full" />}
              condition={conditionLabel(day.condition)}
              chance={
                chance !== undefined && chance >= MEANINGFUL_CHANCE_PCT ? (
                  <>
                    {String(Math.round(chance))}%<span className="sr-only"> chance of rain</span>
                    <span aria-hidden="true"> rain</span>
                  </>
                ) : null
              }
              low={
                <>
                  <span className="sr-only">Low </span>
                  {formatTemperature(day.minC, units)}
                </>
              }
              bar={
                bar && (
                  <>
                    <span
                      aria-hidden="true"
                      data-testid="range-bar"
                      className="bg-muted absolute inset-y-0 rounded-full"
                      style={{
                        left: `${String(bar.startPct)}%`,
                        width: `${String(bar.widthPct)}%`,
                      }}
                    />
                    {isFirst && (
                      <span
                        aria-hidden="true"
                        data-testid="current-marker"
                        className="border-surface bg-accent absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                        style={{ left: `${String(positionOnScale(current.temperatureC, daily))}%` }}
                      />
                    )}
                  </>
                )
              }
              high={
                <>
                  <span className="sr-only">High </span>
                  {formatTemperature(day.maxC, units)}
                </>
              }
            />
          );
        })}
      </ol>
    </Panel>
  );
}

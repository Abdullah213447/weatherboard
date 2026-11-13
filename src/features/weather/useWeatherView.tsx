import { useEffect, type ReactNode } from 'react';
import { Panel } from '@/app/Panel';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { errorCopy } from '@/domain/errorCopy';
import { formatTemperature, TEMPERATURE_UNIT } from '@/domain/units';
import type { City } from '@/domain/weather';
import { useUnits } from '@/features/prefs/units';
import { useNow } from '@/lib/useNow';
import { InlineAlert } from '@/ui/InlineAlert';
import { CurrentConditions, CurrentConditionsSkeleton } from './CurrentConditions';
import { Forecast, ForecastSkeleton } from './Forecast';
import { useWeather } from './useWeather';
import { WeatherStatus } from './WeatherStatus';

const APP_NAME = 'WeatherBoard';
/** Often enough for a clock that shows minutes and for "4 min ago". */
const TICK_MS = 15_000;

type Primary = { current: ReactNode; forecast: ReactNode } | { empty: ReactNode };

export type WeatherView = {
  /** What goes in the dashboard's primary area. Null when no city is chosen. */
  primary: Primary | null;
  /** The freshness line for the header. */
  status: ReactNode;
  /** Text for the live region when new data arrives. */
  announcement: string;
};

/** The viewer's own offset, for "showing data from 14:05" (their clock, not the city's). */
function viewerTime(instant: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(instant);
}

/**
 * Everything the weather area shows for a city, in each of its states:
 * skeletons while loading, the cards on success, the saved copy with a note
 * when a refresh fails, and an explanation with a retry when there is nothing
 * to show. Also keeps the document title in step.
 */
export function useWeatherView(
  city: City | null,
  deps?: Parameters<typeof useWeather>[1],
): WeatherView {
  const state = useWeather(city, deps);
  const units = useUnits();
  const now = useNow(TICK_MS);

  const shown =
    state.status === 'success' ? state.snapshot : state.status === 'error' ? state.saved : null;
  const temperature = shown ? formatTemperature(shown.current.temperatureC, units) : null;

  useEffect(() => {
    document.title =
      shown && temperature ? `${shown.city.name} ${temperature} · ${APP_NAME}` : APP_NAME;
  }, [shown, temperature]);

  if (!city || state.status === 'idle') return { primary: null, status: null, announcement: '' };

  const status = <WeatherStatus state={state} now={now} />;

  if (state.status === 'loading') {
    return {
      primary: {
        current: <CurrentConditionsSkeleton city={city} />,
        forecast: <ForecastSkeleton />,
      },
      status,
      announcement: '',
    };
  }

  if (state.status === 'error' && !state.saved) {
    const copy = errorCopy(state.error);
    return {
      primary: {
        empty: (
          <Panel className="h-full">
            <h2 className="text-xl font-semibold">{city.name}</h2>
            <p className="text-muted mb-4 text-sm">{cityContext(city)}</p>
            <InlineAlert
              tone="danger"
              title={copy.title}
              {...(copy.action.intent === 'retry' && {
                action: { label: copy.action.label, onClick: state.retry },
              })}
            >
              {copy.message}
            </InlineAlert>
          </Panel>
        ),
      },
      status,
      announcement: copy.title,
    };
  }

  if (!shown) return { primary: null, status, announcement: '' };

  const cards = {
    forecast: <Forecast snapshot={shown} units={units} now={now} />,
    current: <CurrentConditions snapshot={shown} units={units} now={now} />,
  };

  if (state.status === 'error') {
    const copy = errorCopy(state.error);
    return {
      primary: {
        ...cards,
        current: (
          <div className="flex flex-col gap-4">
            <InlineAlert
              tone="warning"
              title={`Showing data from ${viewerTime(shown.fetchedAt)}`}
              action={{ label: 'Try again', onClick: state.retry }}
            >
              Couldn&rsquo;t refresh: {copy.title}. {copy.message}
            </InlineAlert>
            {cards.current}
          </div>
        ),
      },
      status,
      announcement: `Showing saved weather for ${city.name}. ${copy.title}.`,
    };
  }

  return {
    primary: cards,
    status,
    announcement: `${city.name}: ${String(temperature).replace('°', '')} degrees ${TEMPERATURE_UNIT[units].name}, ${conditionLabel(shown.current.condition)}.`,
  };
}

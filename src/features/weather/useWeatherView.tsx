import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { Panel } from '@/app/Panel';
import { cityContext } from '@/domain/cities';
import { conditionLabel } from '@/domain/conditionLabel';
import { errorCopy } from '@/domain/errorCopy';
import { formatTemperature, TEMPERATURE_UNIT } from '@/domain/units';
import type { City } from '@/domain/weather';
import { useUnits } from '@/features/prefs/units';
import { connectivity } from '@/lib/connectivity';
import { offlineStore } from '@/lib/offlineStore';
import { useNow } from '@/lib/useNow';
import { useOnline } from '@/lib/useOnline';
import { announce } from '@/ui/announce';
import { Button } from '@/ui/Button';
import { InlineAlert } from '@/ui/InlineAlert';
import { CurrentConditions } from './CurrentConditions';
import { Forecast } from './Forecast';
import { useWeather } from './useWeather';
import { WeatherStatus } from './WeatherStatus';

const APP_NAME = 'WeatherBoard';
/** Often enough for a clock that shows minutes and for "4 min ago". */
const TICK_MS = 15_000;
/** While requests are failing but the browser claims a connection, try again this often. */
const RECHECK_MS = 30_000;

type Primary = { current: ReactNode; forecast: ReactNode } | { empty: ReactNode };

export type WeatherView = {
  /** What goes in the dashboard's primary area. Null when no city is chosen. */
  primary: Primary | null;
  /** The freshness line for the header. */
  status: ReactNode;
  /** Text for the live region when new data arrives. */
  announcement: string;
  /** Set while offline: the sentence that follows "Offline mode." in the banner. */
  offlineMessage: string | null;
  /** True once a city's weather, live or saved, is on screen. */
  hasWeather: boolean;
  /** The manual refresh, or null when there is nothing to refresh. */
  refresh: { onClick: () => void; disabled: boolean } | null;
};

type Options = {
  /** Replaceable in tests. */
  deps?: Parameters<typeof useWeather>[1];
  /** Opens another city: used to offer the saved city when the requested one is not available offline. */
  onOpenCity?: (city: City) => void;
};

/** A moment on the viewer's own clock, for "saved at 14:05". */
function viewerTime(instant: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(instant);
}

/**
 * Everything the weather area shows for a city, in each of its states.
 *
 * Online: skeleton, then the cards; a failed refresh keeps the saved copy
 * with a note and a retry; a failure with nothing saved explains itself.
 *
 * Offline is a mode, not an error: the saved copy is shown plainly with its
 * age, nothing offers a retry that cannot work, and the data refreshes by
 * itself when the connection returns.
 */
export function useWeatherView(city: City | null, { deps, onOpenCity }: Options = {}): WeatherView {
  const state = useWeather(city, deps);
  const units = useUnits();
  const now = useNow(TICK_MS);
  const browserOnline = useOnline();
  const store = deps?.store ?? offlineStore;

  // A request that failed for lack of a connection is as good as the browser saying so.
  const offline = !browserOnline || (state.status === 'error' && state.error.kind === 'offline');
  const failed = state.status === 'error';
  // Offline only because requests failed, while the browser reports a connection:
  // the app may be wrong, so a manual retry stays available.
  const canTryAnyway = offline && connectivity.browserReportsOnline();
  const retry = failed ? state.retry : undefined;

  const shown =
    state.status === 'success' ? state.snapshot : state.status === 'error' ? state.saved : null;
  const temperature = shown ? formatTemperature(shown.current.temperatureC, units) : null;

  // Only one city is kept offline. When this is not it (or no city is chosen
  // yet), find out which one is, to offer it or to open on it.
  const needsOther = offline && (city === null || (failed && !state.saved));
  const other = useQuery({
    queryKey: ['weather-saved-any', needsOther],
    enabled: needsOther,
    gcTime: 0,
    queryFn: () => store.read(),
  });
  const otherSaved = needsOther ? (other.data ?? null) : null;

  // Cold start with no connection and no remembered city: open what was saved.
  useEffect(() => {
    if (city === null && otherSaved && onOpenCity) onOpenCity(otherSaved.city);
  }, [city, otherSaved, onOpenCity]);

  // Back online: refresh without being asked, and say so politely.
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && browserOnline && retry) {
      announce('Back online. Updating the weather.');
      retry();
    }
    wasOffline.current = offline;
  }, [offline, browserOnline, retry]);

  // The browser may claim a connection that does not work. While requests are
  // failing as offline, keep trying quietly so recovery needs no user action.
  useEffect(() => {
    if (!(failed && offline && retry)) return;
    const timer = setInterval(retry, RECHECK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [failed, offline, retry]);

  useEffect(() => {
    document.title =
      shown && temperature ? `${shown.city.name} ${temperature} · ${APP_NAME}` : APP_NAME;
  }, [shown, temperature]);

  const offlineMessage = !offline
    ? null
    : shown
      ? `Showing ${shown.city.name} as saved at ${viewerTime(shown.fetchedAt)}. Search and other cities need a connection.`
      : 'Search and new weather need a connection.';

  if (!city || state.status === 'idle') {
    return {
      primary: null,
      status: null,
      announcement: '',
      offlineMessage,
      hasWeather: false,
      refresh: null,
    };
  }

  const status = <WeatherStatus state={state} now={now} offline={offline} />;
  const refresh =
    state.status === 'success'
      ? { onClick: state.refresh, disabled: offline || state.isRefreshing }
      : state.status === 'error'
        ? { onClick: state.retry, disabled: offline && !canTryAnyway }
        : { onClick: () => undefined, disabled: true };
  const base = { status, offlineMessage, refresh, hasWeather: shown !== null };

  const heading = (
    <>
      <h2 className="text-xl font-semibold">{city.name}</h2>
      <p className="text-muted mb-4 text-sm">{cityContext(city)}</p>
    </>
  );

  if (state.status === 'error' && !state.saved) {
    if (offline) {
      // Not an error: this city simply is not the one kept for offline use.
      return {
        ...base,
        primary: {
          empty: (
            <Panel className="h-full">
              {heading}
              {otherSaved ? (
                <>
                  <p className="text-sm">
                    Only the last city you viewed is kept for offline use, and that is{' '}
                    <span className="font-medium">{otherSaved.city.name}</span>. {city.name} will
                    load when you are back online.
                  </p>
                  {onOpenCity && (
                    <Button
                      className="mt-4"
                      onClick={() => {
                        onOpenCity(otherSaved.city);
                      }}
                    >
                      Show {otherSaved.city.name}
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm">
                  Nothing has been saved for offline use yet. Reconnect and open a city once; after
                  that, the last city you viewed stays available without a connection.
                </p>
              )}
              {canTryAnyway && (
                <p className="text-muted mt-4 text-sm">
                  Your device reports a connection, but the weather services could not be reached.
                  Use the refresh button above to try again.
                </p>
              )}
            </Panel>
          ),
        },
        announcement: otherSaved
          ? `${city.name} is not available offline. ${otherSaved.city.name} is.`
          : 'You are offline and nothing is saved yet.',
      };
    }

    const copy = errorCopy(state.error);
    return {
      ...base,
      primary: {
        empty: (
          <Panel className="h-full">
            {heading}
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
      announcement: copy.title,
    };
  }

  // Loading and loaded render the same two components in the same places, so
  // the skeleton becomes the card in place rather than being swapped for it.
  const cards = {
    forecast: <Forecast snapshot={shown} units={units} now={now} />,
    current: <CurrentConditions city={city} snapshot={shown} units={units} now={now} />,
  };

  if (state.status === 'loading' || !shown) return { ...base, primary: cards, announcement: '' };

  if (state.status === 'error') {
    // Offline, the banner already says what is being shown and why.
    if (offline) {
      return {
        ...base,
        primary: cards,
        announcement: `Offline. Showing ${city.name} as saved at ${viewerTime(shown.fetchedAt)}.`,
      };
    }
    const copy = errorCopy(state.error);
    return {
      ...base,
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
      announcement: `Showing saved weather for ${city.name}. ${copy.title}.`,
    };
  }

  return {
    ...base,
    primary: cards,
    announcement: `${city.name}: ${String(temperature).replace('°', '')} degrees ${TEMPERATURE_UNIT[units].name}, ${conditionLabel(shown.current.condition)}.`,
  };
}

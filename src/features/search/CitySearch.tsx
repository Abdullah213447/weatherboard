import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
  type SyntheticEvent,
} from 'react';
import { cityContext, findMatchRange, flagEmoji, matchesPrefix } from '@/domain/cities';
import { errorCopy } from '@/domain/errorCopy';
import { CITY_QUERY_MESSAGES, validateCityQuery, type CityQueryProblem } from '@/domain/validation';
import type { City } from '@/domain/weather';
import { useOnline } from '@/lib/useOnline';
import { Button } from '@/ui/Button';
import { cx } from '@/ui/cx';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { LiveRegion } from '@/ui/LiveRegion';
import type { CitySearcher } from './citySearcher';
import { citySearcher } from './defaultSearcher';
import { markSuggestionsPainted } from './suggestionTiming';
import { useSearchController } from './useSearchController';

export type CitySearchHandle = {
  /** Puts `text` in the field and selects its top match, as a suggested-city chip does. */
  searchFor(text: string): void;
};

/** A city the user already has a relationship with, and why. */
export type KnownCity = { city: City; label: 'Recent' | 'Favourite' };

const GEODB_ORIGIN = 'https://wft-geo-db.p.rapidapi.com';
const MAX_OPTIONS = 6;

/**
 * Opens the connection to the search API ahead of the first request, so the
 * DNS lookup and TLS handshake happen while the user is still typing.
 */
function preconnectOnce(origin: string): void {
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  // The search request sends custom headers, so it uses a CORS connection.
  link.crossOrigin = 'anonymous';
  document.head.append(link);
}

type CitySearchProps = {
  onSelect: (city: City) => void;
  /** Recent searches and favourites: offered instantly, before the network answers. */
  known?: readonly KnownCity[];
  ref?: Ref<CitySearchHandle>;
  /** Replaceable in tests. */
  searcher?: CitySearcher;
};

function CityName({ name, query }: { name: string; query: string }) {
  const range = findMatchRange(name, query);
  if (!range) return <>{name}</>;
  const [start, end] = range;
  return (
    <>
      {name.slice(0, start)}
      <mark className="text-ink bg-transparent font-semibold">{name.slice(start, end)}</mark>
      {name.slice(end)}
    </>
  );
}

/**
 * City search as a WAI-ARIA combobox: a text field that controls a listbox
 * of suggestions. Focus never leaves the field; the highlighted option is
 * communicated with aria-activedescendant.
 */
const NO_KNOWN: readonly KnownCity[] = [];

export function CitySearch({
  onSelect,
  known = NO_KNOWN,
  ref,
  searcher = citySearcher,
}: CitySearchProps) {
  const [search, controller] = useSearchController(searcher);
  const online = useOnline();

  const [value, setValue] = useState('');
  /** True once the user has typed or submitted. An untouched field is never marked invalid. */
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<CityQueryProblem | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedNotice, setSelectedNotice] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const messageId = `${id}-message`;
  const errorId = `${id}-error`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const searchable = validateCityQuery(value) === null;
  // Known cities come first and never move: results from the network are
  // added underneath them, so the list grows without jumping.
  const instant = searchable ? known.filter(({ city }) => matchesPrefix(city.name, value)) : [];
  const settled = search.query === value.trim() && search.status === 'results';
  const fetched =
    !searchable || search.status === 'error'
      ? []
      : // Suggestions left over from the previous keystroke stay only if they still match.
        search.cities.filter((city) => settled || matchesPrefix(city.name, value));
  const labels = new Map(instant.map(({ city, label }) => [city.id, label]));
  const options = [
    ...instant.map(({ city }) => city),
    ...fetched.filter((city) => !labels.has(city.id)),
  ].slice(0, MAX_OPTIONS);
  const offlineNow = !online || search.error?.kind === 'offline';
  const failure = search.status === 'error' && search.error && !offlineNow ? search.error : null;
  const noResults = searchable && search.status === 'no-results' && options.length === 0;
  const busy = search.status === 'searching' && search.showIndicator;
  const listVisible = open && options.length > 0;
  const panelVisible = open && searchable && (options.length > 0 || noResults || failure !== null);
  const active = listVisible ? Math.min(activeIndex, options.length - 1) : -1;

  // Development only: time from the last keystroke to painted suggestions.
  const { status, timing } = search;
  const lastInputAt = useRef(0);
  const instantCount = instant.length;
  useEffect(() => {
    if (import.meta.env.DEV && status === 'results' && timing) markSuggestionsPainted(timing);
  }, [status, timing]);
  useEffect(() => {
    if (import.meta.env.DEV && instantCount > 0) {
      markSuggestionsPainted({ inputAt: lastInputAt.current, origin: 'known' });
    }
  }, [instantCount, value]);

  const select = (city: City) => {
    onSelect(city);
    // A command input: once the command has run, the field is ready for the
    // next one. The card shows which city is on screen.
    setValue('');
    setTouched(false);
    setProblem(null);
    setOpen(false);
    setActiveIndex(-1);
    setSelectedNotice(`${city.name}, ${cityContext(city)} selected.`);
    controller.reset();
    // On a touch screen the keyboard would cover the weather just asked for.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      inputRef.current?.blur();
    }
  };

  const change = (next: string) => {
    lastInputAt.current = performance.now();
    setValue(next);
    setTouched(true);
    setOpen(true);
    setActiveIndex(-1);
    setSelectedNotice('');
    // An error disappears the moment the text becomes searchable, not on the next blur.
    if (problem !== null && validateCityQuery(next) === null) setProblem(null);
    controller.setQuery(next);
  };

  const submit = async (text: string) => {
    setTouched(true);
    const invalid = validateCityQuery(text);
    setProblem(invalid);
    if (invalid) return;
    setOpen(true);
    const settled = await controller.submit(text);
    // Typed text with no choice made: take the best match if there is one.
    // With none, the settled state already shows why.
    const [top] = settled.status === 'results' ? settled.cities : [];
    if (top) select(top);
  };

  useImperativeHandle(ref, () => ({
    searchFor(text) {
      setValue(text);
      inputRef.current?.focus();
      void submit(text);
    },
  }));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        if (count > 0) setActiveIndex(listVisible ? (active + 1) % count : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        if (count > 0) setActiveIndex(listVisible && active > 0 ? active - 1 : count - 1);
        break;
      case 'Home':
        if (listVisible) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (listVisible) {
          event.preventDefault();
          setActiveIndex(count - 1);
        }
        break;
      case 'Enter': {
        const choice = options[active];
        if (listVisible && choice) {
          event.preventDefault();
          select(choice);
        }
        // Otherwise the form submits and picks the top match.
        break;
      }
      case 'Escape':
        if (panelVisible) {
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        } else if (value !== '') {
          event.preventDefault();
          change('');
        }
        break;
    }
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    void submit(value);
  };

  let announcement = selectedNotice;
  if (failure) announcement = errorCopy(failure).title;
  else if (noResults) announcement = `No cities match "${search.query}".`;
  else if (listVisible) {
    announcement = `${String(options.length)} ${options.length === 1 ? 'city' : 'cities'} found. Use the up and down arrow keys to choose.`;
  } else if (busy) announcement = 'Searching for cities.';

  const describedBy =
    [problem && errorId, (offlineNow || panelVisible) && messageId].filter(Boolean).join(' ') ||
    undefined;
  const failureCopy = failure ? errorCopy(failure) : null;

  return (
    <form role="search" onSubmit={onSubmit} noValidate className="relative">
      <label htmlFor={id} className="sr-only">
        Search for a city
      </label>
      <div className="relative">
        <Icon
          name="search"
          size={18}
          className="text-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          placeholder="Search for a city"
          value={value}
          disabled={!online}
          aria-expanded={listVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-invalid={problem !== null || undefined}
          aria-describedby={describedBy}
          aria-busy={busy || undefined}
          onChange={(event) => {
            change(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            preconnectOnce(GEODB_ORIGIN);
            if (searchable) setOpen(true);
          }}
          onBlur={() => {
            // Options keep focus in the field on pointer-down, so a blur
            // always means the user has really left it.
            setOpen(false);
            setActiveIndex(-1);
            if (touched) setProblem(validateCityQuery(value));
          }}
          className={cx(
            'bg-surface placeholder:text-subtle h-11 w-full rounded-md border pr-11 pl-10 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            problem ? 'border-danger' : 'border-control',
          )}
        />
        <div className="absolute top-0 right-0 flex h-11 items-center">
          {busy && (
            <span
              aria-hidden="true"
              className="text-muted mr-3 size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          )}
          {!busy && value !== '' && online && (
            <IconButton
              label="Clear search"
              icon="close"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                change('');
                inputRef.current?.focus();
              }}
            />
          )}
        </div>
      </div>

      {problem && (
        <p id={errorId} className="text-danger mt-1.5 flex items-center gap-1.5 text-sm">
          <Icon name="danger" size={16} className="shrink-0" />
          {CITY_QUERY_MESSAGES[problem]}
        </p>
      )}

      {offlineNow && (
        <p id={messageId} className="text-muted mt-1.5 text-sm">
          You are offline, so city search is paused. It comes back when you reconnect; the city you
          last viewed still works.
        </p>
      )}

      {/* The listbox stays in the DOM so aria-controls always points at something. */}
      <div
        className={cx(
          'border-line-strong bg-raised shadow-raised absolute top-12 right-0 left-0 z-20 overflow-hidden rounded-md border',
          !panelVisible && 'hidden',
        )}
        onMouseDown={(event) => {
          // Keep focus in the field while a suggestion or button here is pressed.
          event.preventDefault();
        }}
        role="presentation"
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Cities"
          className={cx(!listVisible && 'hidden')}
        >
          {options.map((city, index) => (
            // Keyboard access is through the combobox input (aria-activedescendant),
            // which is how the ARIA pattern works: options are never focused.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
            <div
              key={city.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onClick={() => {
                select(city);
              }}
              onMouseEnter={() => {
                setActiveIndex(index);
              }}
              className={cx(
                'flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2',
                index === active && 'bg-hover',
              )}
            >
              <span aria-hidden="true" className="w-6 shrink-0 text-center text-base">
                {flagEmoji(city.countryCode)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-muted block truncate text-sm">
                  <CityName name={city.name} query={value} />
                </span>
                <span className="text-subtle block truncate text-xs">{cityContext(city)}</span>
              </span>
              {labels.has(city.id) && (
                <span className="border-line text-subtle shrink-0 rounded-full border px-2 py-0.5 text-xs">
                  {labels.get(city.id)}
                </span>
              )}
              <span className="text-subtle shrink-0 text-xs font-medium">{city.countryCode}</span>
            </div>
          ))}
        </div>

        {listVisible && search.servedBy === 'open-meteo' && (
          <p className="border-line text-subtle border-t px-3 py-2 text-xs">
            Showing results from the backup city search. The main one is busy.
          </p>
        )}

        {noResults && (
          <p id={messageId} className="text-muted px-3 py-3 text-sm">
            No cities match &ldquo;{search.query}&rdquo;. Check the spelling or try a nearby larger
            city.
          </p>
        )}

        {failureCopy && (
          <div id={messageId} className="flex flex-col items-start gap-2 px-3 py-3">
            <p className="text-ink text-sm font-medium">{failureCopy.title}</p>
            <p className="text-muted text-sm">{failureCopy.message}</p>
            {failureCopy.action.intent === 'retry' && (
              <Button
                size="sm"
                onClick={() => {
                  controller.retry();
                }}
              >
                {failureCopy.action.label}
              </Button>
            )}
          </div>
        )}
      </div>

      <LiveRegion message={announcement} />
    </form>
  );
}

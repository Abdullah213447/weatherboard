import * as Dialog from '@radix-ui/react-dialog';
import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { Panel } from '@/app/Panel';
import { errorCopy } from '@/domain/errorCopy';
import { nextFireAt, parseTime } from '@/domain/reminderTime';
import type { UnitSystem } from '@/domain/units';
import type { City } from '@/domain/weather';
import { AddToHomeScreenSteps } from '@/features/pwa/AddToHomeScreenSteps';
import { useNow } from '@/lib/useNow';
import { Button } from '@/ui/Button';
import { InlineAlert } from '@/ui/InlineAlert';
import type { ReminderSettings } from './reminderApi';
import type { ReminderController } from './reminderController';

export const DEFAULT_TIME = '07:30';
const TIME_PROBLEM = 'Enter a time, for example 07:30';

type ReminderCardProps = {
  controller: ReminderController;
  /** The city on screen, offered first. */
  city: City | null;
  /** Other cities the reminder can report. */
  favourites: readonly City[];
  unit: UnitSystem;
  online: boolean;
};

const toReminderCity = (city: City): ReminderSettings['city'] => ({
  id: city.id,
  name: city.name,
  lat: city.coords.lat,
  lon: city.coords.lon,
});

/** "Sunday 15 November at 07:30", on the user's own clock. */
function formatFireTime(instant: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

type ExplainerProps = {
  open: boolean;
  time: string;
  cityName: string;
  onCancel: () => void;
  /** Runs in the click itself, so the browser's prompt is tied to a user gesture. */
  onContinue: () => void;
};

/**
 * Our own explanation, shown before the browser's permission prompt: what
 * will be sent, when, and what is kept. People refuse a prompt they did not
 * expect, and a refusal is hard to undo.
 */
function Explainer({ open, time, cityName, onCancel, onContinue }: ExplainerProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-scrim animate-fade-in fixed inset-0 z-40" />
        <Dialog.Content className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in fixed top-1/2 left-1/2 z-40 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border p-5">
          <Dialog.Title className="text-lg font-semibold">Before your browser asks</Dialog.Title>
          <Dialog.Description className="text-muted mt-1 text-sm">
            Next, your browser will ask whether WeatherBoard may show notifications. Here is what
            saying yes means.
          </Dialog.Description>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium">What we send</dt>
              <dd className="text-muted">
                One notification a day with the day&rsquo;s forecast for {cityName}. Nothing else.
              </dd>
            </div>
            <div>
              <dt className="font-medium">When</dt>
              <dd className="text-muted">
                Within 5 minutes of {time}, in your own time zone, even with WeatherBoard closed.
              </dd>
            </div>
            <div>
              <dt className="font-medium">What is stored on the server</dt>
              <dd className="text-muted">
                Your browser&rsquo;s push address, the time, your time zone, the city and your unit.
                No account, name or location.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Turning it off</dt>
              <dd className="text-muted">
                At any time from this card, which deletes all of the above.
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onCancel}>Not now</Button>
            <Button variant="primary" onClick={onContinue}>
              Continue
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-muted text-sm">{children}</p>;
}

/**
 * The daily reminder: a morning notification with the day's forecast.
 * Whatever state it is in, it stays inside this card and nothing else in the
 * app depends on it.
 */
export function ReminderCard({ controller, city, favourites, unit, online }: ReminderCardProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const now = useNow(30_000);
  const timeId = useId();
  const cityId = useId();
  const problemId = useId();

  const options = [...(city ? [city] : []), ...favourites.filter((entry) => entry.id !== city?.id)];
  const confirmed = state.settings;

  const [time, setTime] = useState(confirmed?.time ?? DEFAULT_TIME);
  const [chosenId, setChosenId] = useState<string | null>(confirmed?.city.id ?? null);
  const [timeProblem, setTimeProblem] = useState(false);
  const [explaining, setExplaining] = useState(false);

  // When the confirmed settings arrive or change (after a reload, or a save), the form follows them.
  const [syncedTo, setSyncedTo] = useState(confirmed);
  if (confirmed !== syncedTo) {
    setSyncedTo(confirmed);
    if (confirmed) {
      setTime(confirmed.time);
      setChosenId(confirmed.city.id);
    }
  }

  // The user may have changed the permission in the browser's settings while away.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') controller.recheckPermission();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [controller]);

  // The confirmed city is offered even if it is no longer on screen or a favourite.
  const choices: ReminderSettings['city'][] = options.map(toReminderCity);
  if (confirmed && !choices.some((entry) => entry.id === confirmed.city.id)) {
    choices.push(confirmed.city);
  }
  const chosen = choices.find((entry) => entry.id === chosenId) ?? choices[0] ?? null;
  const validTime = parseTime(time) !== null;
  const disabled = !online || state.busy;
  const changed =
    confirmed !== null && (confirmed.time !== time || confirmed.city.id !== chosen?.id);

  const validate = () => {
    setTimeProblem(!validTime);
    return validTime;
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!validate() || !chosen) return;
    if (state.status === 'on') void controller.update({ time, city: chosen, unit });
    else setExplaining(true);
  };

  let body: ReactNode;
  if (state.status === 'checking') {
    body = <Message>Checking this browser&hellip;</Message>;
  } else if (state.status === 'unsupported') {
    body = (
      <Message>
        This browser cannot show notifications from websites, so reminders are not available here.
        They work in Chrome, Edge and Firefox on a computer or Android, and in Safari on a Mac.
        Everything else in WeatherBoard works as usual.
      </Message>
    );
  } else if (state.status === 'ios-install') {
    body = (
      <div className="flex flex-col gap-3">
        <Message>
          On an iPhone or iPad, reminders need WeatherBoard on your Home Screen (iOS 16.4 or later).
          Add it, open it from there, and this card will offer the reminder.
        </Message>
        <AddToHomeScreenSteps />
      </div>
    );
  } else if (state.status === 'blocked') {
    body = (
      <Message>
        Notifications are blocked for WeatherBoard in this browser, so a reminder cannot be shown.
        To allow them, open the site settings from the icon beside the address bar, set
        Notifications to Allow, then come back to this page. This card checks again when you return.
      </Message>
    );
  } else {
    const on = state.status === 'on' && confirmed !== null;
    body = (
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        {on ? (
          <p className="text-sm" data-testid="reminder-next">
            <span className="font-medium">On.</span> Next reminder:{' '}
            {formatFireTime(nextFireAt(confirmed.time, confirmed.timeZone, now))} (
            {confirmed.timeZone.replaceAll('_', ' ')}), for {confirmed.city.name}.
          </p>
        ) : (
          <Message>
            A notification each morning with the day&rsquo;s forecast, even with WeatherBoard
            closed.
          </Message>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={timeId} className="text-muted mb-1 block text-xs">
              Time
            </label>
            <input
              id={timeId}
              type="time"
              required
              value={time}
              disabled={disabled}
              aria-invalid={timeProblem || undefined}
              aria-describedby={timeProblem ? problemId : undefined}
              onChange={(event) => {
                setTime(event.target.value);
                if (parseTime(event.target.value)) setTimeProblem(false);
              }}
              onBlur={validate}
              className={`bg-surface h-11 w-full rounded-md border px-3 text-base disabled:cursor-not-allowed disabled:opacity-60 ${timeProblem ? 'border-danger' : 'border-control'}`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={cityId} className="text-muted mb-1 block text-xs">
              City
            </label>
            <select
              id={cityId}
              value={chosen?.id ?? ''}
              disabled={disabled || choices.length === 0}
              onChange={(event) => {
                setChosenId(event.target.value);
              }}
              className="border-control bg-surface h-11 w-full rounded-md border px-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              {choices.length === 0 && <option value="">No city yet</option>}
              {choices.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {timeProblem && (
          <p id={problemId} className="text-danger text-sm">
            {TIME_PROBLEM}
          </p>
        )}
        <p className="text-subtle text-xs">It arrives within 5 minutes of the time you choose.</p>
        {choices.length === 0 && (
          <Message>Search for a city first; the reminder reports the city you choose.</Message>
        )}

        {state.note === 'turned-off-elsewhere' && (
          <Message>
            Your reminder was turned off because this browser no longer allows notifications for
            WeatherBoard, or dropped its subscription. Turn it on again to keep receiving it.
          </Message>
        )}
        {state.note === 'test-sent' && (
          <p role="status" className="text-sm">
            Sent. It arrives in about 10 seconds: close this tab now to see it arrive without
            WeatherBoard open.
          </p>
        )}
        {state.error && (
          <InlineAlert tone="danger" title={`Not saved: ${errorCopy(state.error).title}`}>
            {errorCopy(state.error).message}{' '}
            {on ? 'Your reminder is unchanged.' : 'The reminder is still off.'}
          </InlineAlert>
        )}
        {!online && (
          <Message>
            You are offline, so the reminder cannot be changed right now.
            {on && ' The one you have already set still arrives.'}
          </Message>
        )}

        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <Button type="submit" variant="primary" size="sm" disabled={disabled || !changed}>
                Save changes
              </Button>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => {
                  void controller.sendTest();
                }}
              >
                Send a test notification
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  void controller.disable();
                }}
              >
                Turn off
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" size="sm" disabled={disabled || !chosen}>
              Turn on
            </Button>
          )}
        </div>

        <Explainer
          open={explaining}
          time={time}
          cityName={chosen?.name ?? 'your city'}
          onCancel={() => {
            setExplaining(false);
          }}
          onContinue={() => {
            // Straight from this click into the controller, which asks for
            // permission before it awaits anything: Safari needs the gesture.
            if (chosen) void controller.enable({ time, city: chosen, unit });
            setExplaining(false);
          }}
        />
      </form>
    );
  }

  return <Panel title="Daily reminder">{body}</Panel>;
}

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppError } from '@/domain/errors';
import type { City } from '@/domain/weather';
import { lahore } from '@/test/favourites';
import { karachi } from '@/test/weather';
import { ReminderCard } from './ReminderCard';
import { createReminderController } from './reminderController';
import { createTestEnv, karachiSettings, subscription } from './testEnv';

type Setup = Parameters<typeof createTestEnv>[0] & {
  city?: City | null;
  favourites?: City[];
  online?: boolean;
};

async function setup({ city = karachi, favourites = [], online = true, ...world }: Setup = {}) {
  const context = createTestEnv(world);
  const controller = createReminderController(context.env);
  await controller.reconcile({ unit: 'metric' });
  context.calls.length = 0;
  context.api.save.mockClear();
  const user = userEvent.setup();
  render(
    <ReminderCard
      controller={controller}
      city={city}
      favourites={favourites}
      unit="metric"
      online={online}
    />,
  );
  return { ...context, controller, user };
}

const card = () => within(screen.getByRole('region', { name: 'Daily reminder' }));
const on = { permission: 'granted', subscription, stored: karachiSettings } as const;

describe('states', () => {
  it('unsupported: says so, what does work, and offers no control', async () => {
    await setup({ support: 'unsupported' });

    expect(card().getByText(/cannot show notifications from websites/)).toHaveTextContent(
      'They work in Chrome, Edge and Firefox on a computer or Android, and in Safari on a Mac.',
    );
    expect(card().getByText(/Everything else in WeatherBoard works as usual/)).toBeInTheDocument();
    expect(card().queryByRole('button')).not.toBeInTheDocument();
  });

  it('iPhone or iPad, not installed: explains the Home Screen requirement and shows the steps', async () => {
    await setup({ support: 'ios-install' });

    expect(
      card().getByText(/need WeatherBoard on your Home Screen \(iOS 16\.4 or later\)/),
    ).toBeInTheDocument();
    expect(card().getAllByRole('listitem')).toHaveLength(3);
    expect(card().getByText('Add to Home Screen')).toBeInTheDocument();
    expect(card().queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
  });

  it('off: a time defaulting to 07:30, the city on screen, and "Turn on"', async () => {
    await setup({ favourites: [lahore] });

    expect(card().getByLabelText('Time')).toHaveValue('07:30');
    expect(card().getByLabelText('City')).toHaveValue(karachi.id);
    expect(
      within(card().getByLabelText('City'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Karachi', 'Lahore']);
    expect(
      card().getByText('It arrives within 5 minutes of the time you choose.'),
    ).toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeEnabled();
  });

  it('off with no city anywhere: says to search first', async () => {
    await setup({ city: null });

    expect(card().getByText(/Search for a city first/)).toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('on: shows the next reminder with its zone and city, and the three actions', async () => {
    await setup(on);

    const next = card().getByTestId('reminder-next');
    expect(next).toHaveTextContent(
      /^On\. Next reminder: .*\d{1,2}:30.* \(Asia\/Karachi\), for Karachi\.$/,
    );
    expect(card().getByRole('button', { name: 'Send a test notification' })).toBeEnabled();
    expect(card().getByRole('button', { name: 'Turn off' })).toBeEnabled();
    // Nothing to save until something is changed.
    expect(card().getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('blocked: says how to allow notifications again', async () => {
    await setup({ permission: 'denied' });

    expect(card().getByText(/Notifications are blocked for WeatherBoard/)).toHaveTextContent(
      'set Notifications to Allow, then come back to this page',
    );
    expect(card().queryByRole('button')).not.toBeInTheDocument();
  });

  it('blocked: re-checks when the page regains focus', async () => {
    const { world } = await setup({ permission: 'denied' });

    world.permission = 'default';
    window.dispatchEvent(new Event('focus'));

    expect(await card().findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('turned off elsewhere: off, with a short note saying why', async () => {
    await setup({ ...on, subscription: null });

    expect(
      card().getByText(/Your reminder was turned off because this browser no longer allows/),
    ).toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('offline while off: controls disabled, with the reason', async () => {
    await setup({ online: false });

    expect(card().getByLabelText('Time')).toBeDisabled();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeDisabled();
    expect(
      card().getByText(/You are offline, so the reminder cannot be changed right now/),
    ).toBeInTheDocument();
  });

  it('offline while on: says the existing reminder still arrives', async () => {
    await setup({ ...on, online: false });

    expect(card().getByText(/The one you have already set still arrives/)).toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Turn off' })).toBeDisabled();
    expect(card().getByRole('button', { name: 'Send a test notification' })).toBeDisabled();
  });
});

describe('explain before asking', () => {
  it('"Turn on" opens our explainer and does not ask the browser for anything', async () => {
    const { user, requestPermission, calls } = await setup();

    await user.click(card().getByRole('button', { name: 'Turn on' }));

    const dialog = screen.getByRole('dialog', { name: 'Before your browser asks' });
    expect(dialog).toHaveTextContent('One notification a day with the day’s forecast for Karachi');
    expect(dialog).toHaveTextContent(
      'Within 5 minutes of 07:30, in your own time zone, even with WeatherBoard closed',
    );
    expect(dialog).toHaveTextContent(
      'Your browser’s push address, the time, your time zone, the city and your unit',
    );
    expect(dialog).toHaveTextContent('At any time from this card');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('"Not now" closes it and still asks for nothing', async () => {
    const { user, requestPermission } = await setup();
    await user.click(card().getByRole('button', { name: 'Turn on' }));

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('Escape closes it and still asks for nothing', async () => {
    const { user, requestPermission } = await setup();
    await user.click(card().getByRole('button', { name: 'Turn on' }));

    await user.keyboard('{Escape}');

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('only "Continue" asks the browser, and then the card turns on', async () => {
    const { user, requestPermission, api } = await setup({ favourites: [lahore] });
    await user.clear(card().getByLabelText('Time'));
    await user.type(card().getByLabelText('Time'), '06:45');
    await user.selectOptions(card().getByLabelText('City'), 'Lahore');
    await user.click(card().getByRole('button', { name: 'Turn on' }));
    expect(requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await card().findByTestId('reminder-next')).toHaveTextContent('for Lahore.');
    expect(api.save).toHaveBeenCalledExactlyOnceWith(
      {
        time: '06:45',
        timeZone: 'Asia/Karachi',
        city: { id: lahore.id, name: 'Lahore', lat: lahore.coords.lat, lon: lahore.coords.lon },
        unit: 'metric',
      },
      subscription,
    );
  });

  it('a refusal in the browser’s prompt leads to the blocked explanation', async () => {
    const { user } = await setup({ promptAnswer: 'denied' });
    await user.click(card().getByRole('button', { name: 'Turn on' }));

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await card().findByText(/Notifications are blocked for WeatherBoard/),
    ).toBeInTheDocument();
  });
});

describe('could not save', () => {
  it('says what failed and what to do, and does not show "on"', async () => {
    const { user, api } = await setup();
    api.save.mockRejectedValueOnce(new AppError('provider-down', 'push'));
    await user.click(card().getByRole('button', { name: 'Turn on' }));

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const alert = await card().findByRole('alert');
    expect(alert).toHaveTextContent('Not saved: The reminder service is having problems');
    expect(alert).toHaveTextContent('try again shortly');
    expect(alert).toHaveTextContent('The reminder is still off.');
    expect(card().queryByTestId('reminder-next')).not.toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('while on: a failed change leaves the reminder as it was', async () => {
    const { user, api } = await setup(on);
    api.save.mockRejectedValueOnce(new AppError('timeout', 'push'));
    await user.clear(card().getByLabelText('Time'));
    await user.type(card().getByLabelText('Time'), '06:00');

    await user.click(card().getByRole('button', { name: 'Save changes' }));

    expect(await card().findByRole('alert')).toHaveTextContent('Your reminder is unchanged.');
    expect(card().getByTestId('reminder-next')).toHaveTextContent(/\d{1,2}:30/);
  });
});

describe('time validation', () => {
  it('shows an inline message on blur when the time is cleared', async () => {
    const { user } = await setup();
    const time = card().getByLabelText('Time');

    await user.clear(time);
    await user.tab();

    const problem = card().getByText('Enter a time, for example 07:30');
    expect(time).toHaveAttribute('aria-invalid', 'true');
    expect(time).toHaveAttribute('aria-describedby', problem.id);
  });

  it('shows it on submit and does not open the explainer', async () => {
    const { user } = await setup();
    await user.clear(card().getByLabelText('Time'));

    await user.click(card().getByRole('button', { name: 'Turn on' }));

    expect(card().getByText('Enter a time, for example 07:30')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears the message as soon as a valid time is entered', async () => {
    const { user } = await setup();
    const time = card().getByLabelText('Time');
    await user.clear(time);
    await user.tab();

    await user.type(time, '08:10');

    expect(card().queryByText('Enter a time, for example 07:30')).not.toBeInTheDocument();
    expect(time).not.toHaveAttribute('aria-invalid');
  });
});

describe('while on', () => {
  it('enables "Save changes" once the time differs, and saves it', async () => {
    const { user, api } = await setup(on);
    await user.clear(card().getByLabelText('Time'));
    await user.type(card().getByLabelText('Time'), '06:00');

    await user.click(card().getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(api.save).toHaveBeenCalledExactlyOnceWith(
        { ...karachiSettings, time: '06:00' },
        subscription,
      );
    });
    expect(await card().findByText(/\b6:00/)).toBeInTheDocument();
  });

  it('sends a test and says to close the tab to watch it arrive', async () => {
    const { user, api } = await setup(on);

    await user.click(card().getByRole('button', { name: 'Send a test notification' }));

    expect(
      await card().findByText(/It arrives in about 10 seconds: close this tab now/),
    ).toBeInTheDocument();
    expect(api.test).toHaveBeenCalledTimes(1);
  });

  it('turns off', async () => {
    const { user, api } = await setup(on);

    await user.click(card().getByRole('button', { name: 'Turn off' }));

    expect(await card().findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(subscription.endpoint);
  });
});

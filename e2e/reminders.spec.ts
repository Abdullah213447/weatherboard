import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (path: string): string =>
  readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

const CURRENT = fixture('openweathermap/current-karachi.json');
const FORECAST = fixture('openweathermap/forecast-karachi.json');
const GEODB = fixture('geodb/cities-laho.json');
const RECORDED_AT = (JSON.parse(CURRENT) as { dt: number }).dt * 1000;
const KARACHI = '/?city=Karachi~Sindh~PK~24.8607~67.0011';

type Permission = 'granted' | 'denied';

/**
 * Sets up the browser side of push. Headless Chromium has no push service to
 * talk to, so the subscription itself is stood in for; the permission prompt
 * answers as the test says. Everything the app does with them is real.
 */
async function prepare(
  page: Page,
  promptAnswer: Permission,
): Promise<{ saved: unknown[]; removed: number; tests: number }> {
  const seen = { saved: [] as unknown[], removed: 0, tests: 0 };
  await page.clock.setFixedTime(new Date(RECORDED_AT));
  await page.addInitScript((answer) => {
    let permission: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = () => {
      (window as unknown as { __prompted: number }).__prompted =
        ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
      permission = answer;
      return Promise.resolve(permission);
    };
    let subscription: unknown = null;
    const fake = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-subscription',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-subscription',
        keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
      }),
      unsubscribe: () => {
        subscription = null;
        return Promise.resolve(true);
      },
    };
    PushManager.prototype.getSubscription = () =>
      Promise.resolve(subscription as PushSubscription | null);
    PushManager.prototype.subscribe = () => {
      subscription = fake;
      return Promise.resolve(fake as unknown as PushSubscription);
    };
  }, promptAnswer);

  await page.route('https://api.openweathermap.org/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: route.request().url().includes('/forecast?') ? FORECAST : CURRENT,
    }),
  );
  await page.route('https://wft-geo-db.p.rapidapi.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: GEODB }),
  );
  // The server is mocked: these tests are about the app's side of the conversation.
  await page.route('**/api/push/subscribe', async (route) => {
    if (route.request().method() === 'DELETE') {
      seen.removed += 1;
      return route.fulfill({ json: { ok: true } });
    }
    seen.saved.push(route.request().postDataJSON());
    return route.fulfill({
      status: 201,
      json: { ok: true, nextFireAt: RECORDED_AT + 6 * 3600_000 },
    });
  });
  await page.route('**/api/push/test', (route) => {
    seen.tests += 1;
    return route.fulfill({ status: 202, json: { ok: true, arrivesInSeconds: 10 } });
  });
  return seen;
}

const reminder = (page: Page) => page.getByRole('region', { name: 'Daily reminder' });
const prompted = (page: Page) =>
  page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted ?? 0);

// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures argument to be destructured.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One width is enough: this is about behaviour.');
});

test('turn on: our explainer first, the browser prompt only after Continue, then on', async ({
  page,
}) => {
  const server = await prepare(page, 'granted');
  await page.goto(KARACHI);
  const card = reminder(page);
  await expect(card.getByLabel('Time')).toHaveValue('07:30');

  await card.getByRole('button', { name: 'Turn on' }).click();
  const explainer = page.getByRole('dialog', { name: 'Before your browser asks' });
  await expect(explainer).toContainText('One notification a day');
  await expect(explainer).toContainText('What is stored on the server');
  expect(await prompted(page)).toBe(0);

  await explainer.getByRole('button', { name: 'Continue' }).click();

  await expect(card.getByTestId('reminder-next')).toContainText('for Karachi.');
  expect(await prompted(page)).toBe(1);
  expect(server.saved).toHaveLength(1);
  expect(server.saved[0]).toMatchObject({
    time: '07:30',
    city: { id: 'PK:24.86,67.00', name: 'Karachi' },
    unit: 'metric',
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-subscription' },
  });
  expect(typeof (server.saved[0] as { timeZone: unknown }).timeZone).toBe('string');

  await card.getByRole('button', { name: 'Send a test notification' }).click();
  await expect(card.getByText(/It arrives in about 10 seconds/)).toBeVisible();
  expect(server.tests).toBe(1);

  await card.getByRole('button', { name: 'Turn off' }).click();
  await expect(card.getByRole('button', { name: 'Turn on' })).toBeVisible();
  expect(server.removed).toBe(1);
});

test('"Not now" in the explainer never reaches the browser prompt', async ({ page }) => {
  const server = await prepare(page, 'granted');
  await page.goto(KARACHI);
  await reminder(page).getByRole('button', { name: 'Turn on' }).click();

  await page.getByRole('button', { name: 'Not now' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await prompted(page)).toBe(0);
  expect(server.saved).toHaveLength(0);
});

test('permission denied: the card explains, and search, weather and favourites keep working', async ({
  page,
}) => {
  const server = await prepare(page, 'denied');
  await page.goto(KARACHI);
  const card = reminder(page);
  await card.getByRole('button', { name: 'Turn on' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(card.getByText(/Notifications are blocked for WeatherBoard/)).toBeVisible();
  expect(server.saved).toHaveLength(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Weather is on screen.
  await expect(
    page.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('forecast').getByRole('listitem')).toHaveCount(5);

  // Favourites work.
  await page.getByRole('button', { name: 'Save Karachi as a favourite' }).click();
  await expect(page.getByTestId('favourites')).toContainText('1 of 5');

  // Search works.
  const search = page.getByRole('combobox', { name: 'Search for a city' });
  await search.fill('Laho');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/city=Lahore~Punjab~PK~/);
  await expect(
    page.getByTestId('current-conditions').getByRole('heading', { name: 'Lahore' }),
  ).toBeVisible();
});

test('without push support: the card says so and the rest of the app is unaffected', async ({
  page,
}) => {
  await prepare(page, 'granted');
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'PushManager');
  });
  await page.goto(KARACHI);

  const card = reminder(page);
  await expect(card.getByText(/cannot show notifications from websites/)).toBeVisible();
  await expect(card.getByText(/Everything else in WeatherBoard works as usual/)).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(
    page.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
});

test('an invalid time is caught inline before anything is asked', async ({ page }) => {
  await prepare(page, 'granted');
  await page.goto(KARACHI);
  const card = reminder(page);

  await card.getByLabel('Time').fill('');
  await card.getByRole('button', { name: 'Turn on' }).click();

  await expect(card.getByText('Enter a time, for example 07:30')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await prompted(page)).toBe(0);
});

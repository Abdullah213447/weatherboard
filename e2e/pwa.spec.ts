import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const fixture = (path: string): string =>
  readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

const CURRENT = fixture('openweathermap/current-karachi.json');
const FORECAST = fixture('openweathermap/forecast-karachi.json');
const RECORDED_AT = (JSON.parse(CURRENT) as { dt: number }).dt * 1000;
const KARACHI = '/?city=Karachi~Sindh~PK~24.8607~67.0011';

const lahore = {
  id: 'PK:31.42,74.33',
  name: 'Lahore',
  region: 'Punjab',
  country: 'Pakistan',
  countryCode: 'PK',
  coords: { lat: 31.4167, lon: 74.3333 },
};

/**
 * Stands in for the network. While `network.up` is true, weather is answered
 * from the recording; while false, every API request fails the way a real
 * dropped connection does. Paired with context.setOffline for the browser's own flag.
 */
async function network(context: BrowserContext): Promise<{ up: boolean; weatherRequests: number }> {
  const state = { up: true, weatherRequests: 0 };
  await context.route(
    /api\.openweathermap\.org|api\.open-meteo\.com|rapidapi\.com/,
    async (route) => {
      if (!state.up) return route.abort('internetdisconnected');
      const url = route.request().url();
      if (!url.includes('openweathermap')) return route.abort('failed');
      state.weatherRequests += 1;
      return route.fulfill({
        contentType: 'application/json',
        body: url.includes('/forecast?') ? FORECAST : CURRENT,
      });
    },
  );
  return state;
}

async function setOnline(context: BrowserContext, state: { up: boolean }, up: boolean) {
  state.up = up;
  await context.setOffline(!up);
}

/** Loads a city while online and waits until the shell is cached and the weather saved. */
async function visitOnline(page: Page, url = KARACHI): Promise<void> {
  await page.clock.setFixedTime(new Date(RECORDED_AT));
  await page.goto(url);
  await expect(
    page.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const names = await caches.keys();
    const shell = names.some((name) => name.includes('precache'));
    const weather = await (
      await caches.open('wb-last-weather-v1')
    ).match('/__offline/last-weather.json');
    return shell && weather !== undefined;
  });
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures argument to be destructured.
test.beforeEach(({}, testInfo) => {
  test.skip(!['mobile', 'desktop'].includes(testInfo.project.name), 'Checked at 375 and 1280.');
});

test('is installable: no installability errors and a complete manifest', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'One run is enough: this does not depend on width.',
  );
  await network(context);
  await visitOnline(page);

  // Chrome DevTools Protocol, Page domain. Method names and return shapes
  // checked against the protocol definitions that ship with Playwright.
  const devtools = await context.newCDPSession(page);
  const manifest = await devtools.send('Page.getAppManifest');
  const { installabilityErrors } = await devtools.send('Page.getInstallabilityErrors');

  expect(manifest.errors).toEqual([]);
  expect(manifest.url).toMatch(/\/manifest\.webmanifest$/);
  expect(installabilityErrors.map((error) => error.errorId)).toEqual([]);

  const data = JSON.parse(manifest.data ?? '{}') as Record<string, unknown> & {
    icons: { sizes: string; purpose: string; type: string }[];
    screenshots: { form_factor: string; sizes: string }[];
  };
  expect(data).toMatchObject({
    id: '/',
    name: 'WeatherBoard',
    short_name: 'WeatherBoard',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'en',
    theme_color: '#f7f7f5',
    background_color: '#f7f7f5',
  });
  expect(String(data.description).length).toBeGreaterThan(40);
  expect(data.categories).toContain('weather');
  expect(data.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  expect(data.screenshots.map((shot) => shot.form_factor).sort()).toEqual(['narrow', 'wide']);
});

test('ships the icons it declares, at the sizes it declares', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One run is enough.');
  await page.goto('/');
  const sizeOf = (path: string) =>
    page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${String(image.naturalWidth)}x${String(image.naturalHeight)}`;
    }, path);

  expect(await sizeOf('/icons/icon-192.png')).toBe('192x192');
  expect(await sizeOf('/icons/icon-512.png')).toBe('512x512');
  expect(await sizeOf('/icons/icon-maskable-512.png')).toBe('512x512');
  expect(await sizeOf('/icons/apple-touch-icon.png')).toBe('180x180');
  expect(await sizeOf('/screenshots/narrow.png')).toBe('780x1688');
  expect(await sizeOf('/screenshots/wide.png')).toBe('1280x800');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
});

test('the worker precaches the shell and nothing else', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One run is enough.');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () =>
    (await caches.keys()).some((name) => name.includes('precache')),
  );

  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.includes('precache')) ?? '';
    const requests = await (await caches.open(name)).keys();
    return requests.map((request) => new URL(request.url).pathname);
  });

  expect(cached).toContain('/index.html');
  expect(cached.some((path) => /^\/assets\/index-.*\.js$/.test(path))).toBe(true);
  expect(cached.some((path) => /^\/assets\/index-.*\.css$/.test(path))).toBe(true);
  expect(cached.some((path) => /inter-latin-wght-normal.*\.woff2$/.test(path))).toBe(true);
  expect(cached).toContain('/icons/icon-192.png');
  // Install-only assets stay out, and so does every font file the UI does not need.
  expect(cached.filter((path) => path.startsWith('/screenshots/'))).toEqual([]);
  expect(cached.filter((path) => /cyrillic|greek|vietnamese/.test(path))).toEqual([]);
  // No weather or search response is ever stored by the worker.
  const all = await page.evaluate(() => caches.keys());
  expect(all.filter((name) => !name.includes('precache') && !name.startsWith('wb-'))).toEqual([]);
});

test('says once, quietly, that it is ready to use offline', async ({ page, context }) => {
  await network(context);
  await page.clock.setFixedTime(new Date(RECORDED_AT));
  await page.goto(KARACHI);

  await expect(page.getByTestId('offline-ready')).toHaveText('Ready to use offline');

  // The same visit, reloaded: the shell was already cached, so it is not said again.
  await page.reload();
  await expect(
    page.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('offline-ready')).toHaveCount(0);
});

test('offline: the shell loads, the last city renders, and the app says what it can and cannot do', async ({
  page,
  context,
}) => {
  const net = await network(context);
  await page.addInitScript(
    (value) => {
      if (!localStorage.getItem('wb:favourites')) localStorage.setItem('wb:favourites', value);
    },
    JSON.stringify({ version: 1, cities: [lahore] }),
  );
  await visitOnline(page);

  await setOnline(context, net, false);
  await page.reload();

  // The shell came from the service worker; the weather from the saved snapshot.
  await expect(page.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeVisible();
  const card = page.getByTestId('current-conditions');
  await expect(card.getByText('26°', { exact: true })).toBeVisible();
  await expect(page.getByTestId('forecast').getByRole('listitem')).toHaveCount(5);

  const banner = page.getByRole('status').filter({ hasText: 'Offline mode' });
  await expect(banner).toContainText(/Showing Karachi as saved at \d{1,2}:\d{2}/);
  await expect(banner).toContainText('Search and other cities need a connection.');
  await expect(page.getByTestId('weather-status')).toContainText('Offline · saved');

  // A mode, not an error: nothing alarming, nothing to retry.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh weather' })).toBeDisabled();

  const search = page.getByRole('combobox', { name: 'Search for a city' });
  await expect(search).toBeDisabled();
  await expect(page.getByText(/You are offline, so city search is paused/)).toBeVisible();

  // A favourite that is not the saved city: say which one is kept, and offer it.
  await page
    .getByTestId('favourites')
    .getByRole('button', { name: /^Lahore/ })
    .click();
  await expect(
    page.getByText(/Only the last city you viewed is kept for offline use/),
  ).toContainText('that is Karachi');
  await page.getByRole('button', { name: 'Show Karachi' }).click();
  await expect(card.getByText('26°', { exact: true })).toBeVisible();

  // Back online: the banner goes and the data refreshes without being asked.
  const before = net.weatherRequests;
  await setOnline(context, net, true);
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('weather-status')).toContainText('Updated');
  expect(net.weatherRequests).toBeGreaterThan(before);
  await expect(search).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Refresh weather' })).toBeEnabled();
});

test('cold start offline in a new page opens the last city, even with local storage emptied', async ({
  page,
  context,
}) => {
  const net = await network(context);
  await visitOnline(page);
  // The remembered city lives in local storage. Without it, the saved snapshot must be enough.
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.close();
  await setOnline(context, net, false);

  const cold = await context.newPage();
  await cold.clock.setFixedTime(new Date(RECORDED_AT));
  await cold.goto('/');

  await expect(cold.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeVisible();
  await expect(
    cold.getByTestId('current-conditions').getByRole('heading', { name: 'Karachi' }),
  ).toBeVisible();
  await expect(
    cold.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
  await expect(cold.getByRole('status').filter({ hasText: 'Offline mode' })).toContainText(
    'Showing Karachi as saved at',
  );
});

test('a link to a city opens offline, served from the cached shell', async ({ page, context }) => {
  const net = await network(context);
  await visitOnline(page);
  await setOnline(context, net, false);

  // A different city than the saved one, as a shared link would be.
  await page.goto('/?city=Tokyo~Tokyo~JP~35.6762~139.6503');

  await expect(page.getByRole('heading', { level: 2, name: 'Tokyo' })).toBeVisible();
  await expect(
    page.getByText(/Only the last city you viewed is kept for offline use/),
  ).toContainText('that is Karachi');
});

test('with nothing saved, offline says so and what to do', async ({ page, context }) => {
  const net = await network(context);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () =>
    (await caches.keys()).some((name) => name.includes('precache')),
  );
  await setOnline(context, net, false);

  await page.goto(KARACHI);

  await expect(page.getByText(/Nothing has been saved for offline use yet/)).toContainText(
    'Reconnect and open a city once',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Offline mode' })).toBeVisible();
});

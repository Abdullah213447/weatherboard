import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (path: string): string =>
  readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

const CURRENT = fixture('openweathermap/current-karachi.json');
const FORECAST = fixture('openweathermap/forecast-karachi.json');
/** The moment the fixture was observed: 01:38 on 14 Nov 2026 in Karachi. */
const RECORDED_AT = (JSON.parse(CURRENT) as { dt: number }).dt * 1000;
const KARACHI = '/?city=Karachi~Sindh~PK~24.8607~67.0011';

/** Answers OpenWeatherMap from the recording and counts what reached "the network". */
async function interceptWeather(page: Page, delayMs = 0): Promise<{ requests: number }> {
  const seen = { requests: 0 };
  await page.route('https://api.openweathermap.org/**', async (route) => {
    seen.requests += 1;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      contentType: 'application/json',
      body: route.request().url().includes('/forecast?') ? FORECAST : CURRENT,
    });
  });
  return seen;
}

test.beforeEach(async ({ page }) => {
  // The forecast is grouped into days relative to "now", so now is held at the recording.
  await page.clock.setFixedTime(new Date(RECORDED_AT));
});

test('a selected city shows current conditions and a five-day forecast', async ({
  page,
}, testInfo) => {
  await interceptWeather(page);
  await page.goto(KARACHI);

  const card = page.getByTestId('current-conditions');
  await expect(card.getByRole('heading', { name: 'Karachi' })).toBeVisible();
  await expect(card.getByText('26°', { exact: true })).toBeVisible();
  await expect(card.getByText('Fog', { exact: true })).toBeVisible();
  await expect(card.getByText('78%')).toBeVisible();
  await expect(card.getByText(/6 km\/h/)).toBeVisible();
  // A night reading: the card is a dark island on either page theme.
  await expect(card).toHaveAttribute('data-theme', 'dark');

  const rows = page.getByTestId('forecast').getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Today');
  await expect(page.getByTestId('range-bar')).toHaveCount(5);

  await expect(page.getByTestId('weather-status')).toContainText('OpenWeatherMap');
  await expect(page).toHaveTitle('Karachi 26° · WeatherBoard');

  // The unit control is in view next to the temperature, with full-size targets on a phone.
  const unit = card.locator('label[title="Celsius"]');
  await expect(unit).toBeVisible();
  const unitBox = await unit.boundingBox();
  const minimum = ['mobile', 'mobile-fine'].includes(testInfo.project.name) ? 44 : 36;
  expect(unitBox?.width).toBeGreaterThanOrEqual(minimum);
  expect(unitBox?.height).toBeGreaterThanOrEqual(minimum);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({
    path: `test-results/screens/weather-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('switching units converts the display without another request, and is remembered', async ({
  page,
}) => {
  const weather = await interceptWeather(page);
  await page.goto(KARACHI);
  const card = page.getByTestId('current-conditions');
  await expect(card.getByText('26°', { exact: true })).toBeVisible();
  expect(weather.requests).toBe(2);

  // The unit control sits on the card, beside the number it describes.
  await card.locator('label[title="Fahrenheit"]').click();

  await expect(card.getByText('79°', { exact: true })).toBeVisible();
  await expect(card.getByText(/3 mph/)).toBeVisible();
  await expect(page).toHaveTitle('Karachi 79° · WeatherBoard');
  expect(weather.requests).toBe(2);

  await page.reload();
  await expect(
    page.getByTestId('current-conditions').getByText('79°', { exact: true }),
  ).toBeVisible();
});

test('nothing shifts when the weather replaces its skeleton', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __cls: number };
    state.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) state.__cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  // Slow enough that the skeleton is certainly painted first.
  await interceptWeather(page, 700);
  await page.goto(KARACHI);

  const card = page.getByTestId('current-conditions');
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await expect(card.getByText('26°', { exact: true })).toBeVisible();
  await page.waitForTimeout(400);

  // Arrived in place: the tint is applied to the same card element that held the skeleton.
  await expect(card).toHaveAttribute('data-theme', 'dark');

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  // "Good" is under 0.1 by Core Web Vitals; this holds the app to a tenth of that.
  expect(cls).toBeLessThan(0.01);
});

test('when neither source can be reached, the app treats it as offline and a manual refresh recovers', async ({
  page,
}) => {
  await page.route('https://api.openweathermap.org/**', (route) => route.abort());
  await page.route('https://api.open-meteo.com/**', (route) => route.abort());
  await page.goto(KARACHI);

  // The browser still claims a connection, but nothing answers: that is offline in practice.
  await expect(page.getByRole('status').filter({ hasText: 'Offline mode' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole('heading', { name: 'Karachi' })).toBeVisible();
  await expect(page.getByText(/Nothing has been saved for offline use yet/)).toBeVisible();
  await expect(page.getByText(/the weather services could not be reached/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Because the browser reports a connection, trying again by hand stays possible.
  const refresh = page.getByRole('button', { name: 'Refresh weather' });
  await expect(refresh).toBeEnabled();
  await page.unroute('https://api.openweathermap.org/**');
  await interceptWeather(page);
  await refresh.click();

  await expect(
    page.getByTestId('current-conditions').getByText('26°', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline mode' })).toHaveCount(0);
});

test.describe('in a US-locale browser', () => {
  test.use({ locale: 'en-US' });

  test('temperatures start in Fahrenheit', async ({ page }) => {
    await interceptWeather(page);
    await page.goto(KARACHI);

    const card = page.getByTestId('current-conditions');
    await expect(card.getByText('79°', { exact: true })).toBeVisible();
    await expect(card.getByText(/3 mph/)).toBeVisible();
  });
});

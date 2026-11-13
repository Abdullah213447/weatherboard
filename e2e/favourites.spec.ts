import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (path: string): string =>
  readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

const CURRENT = fixture('openweathermap/current-karachi.json');
const FORECAST = fixture('openweathermap/forecast-karachi.json');
const RECORDED_AT = (JSON.parse(CURRENT) as { dt: number }).dt * 1000;

type SeedCity = {
  name: string;
  region: string;
  country: string;
  code: string;
  lat: number;
  lon: number;
};

const toCity = ({ name, region, country, code, lat, lon }: SeedCity) => ({
  id: `${code}:${lat.toFixed(2)},${lon.toFixed(2)}`,
  name,
  region,
  country,
  countryCode: code,
  coords: { lat, lon },
});

/** Five real places with long names, to stress the layout. */
const LONG_NAMED = [
  {
    name: 'Thiruvananthapuram',
    region: 'Kerala',
    country: 'India',
    code: 'IN',
    lat: 8.5241,
    lon: 76.9366,
  },
  {
    name: 'San Fernando del Valle de Catamarca',
    region: 'Catamarca',
    country: 'Argentina',
    code: 'AR',
    lat: -28.4696,
    lon: -65.7852,
  },
  {
    name: 'Llanfairpwllgwyngyll',
    region: 'Wales',
    country: 'United Kingdom',
    code: 'GB',
    lat: 53.2213,
    lon: -4.2099,
  },
  {
    name: 'Santa Cruz de la Sierra',
    region: 'Santa Cruz Department',
    country: 'Bolivia',
    code: 'BO',
    lat: -17.8146,
    lon: -63.1561,
  },
  {
    name: 'Krung Thep Maha Nakhon',
    region: 'Bangkok',
    country: 'Thailand',
    code: 'TH',
    lat: 13.7563,
    lon: 100.5018,
  },
].map(toCity);

const KARACHI = '/?city=Karachi~Sindh~PK~24.8607~67.0011';
const HONOLULU = '/?city=Honolulu~Hawaii~US~21.3069~-157.8583';

/** Puts favourites in storage before the app starts, once, so a reload keeps later changes. */
async function seedFavourites(page: Page, cities: unknown[]): Promise<void> {
  await page.addInitScript(
    (value) => {
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      localStorage.setItem('wb:favourites', value);
    },
    JSON.stringify({ version: 1, cities }),
  );
}

const isPhone = (name: string) => name === 'mobile';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!['mobile', 'desktop'].includes(testInfo.project.name), 'Checked at 375 and 1280.');
  await page.clock.setFixedTime(new Date(RECORDED_AT));
  // Every city gets the same recorded weather; only the layout and behaviour are under test.
  await page.route('https://api.openweathermap.org/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: route.request().url().includes('/forecast?') ? FORECAST : CURRENT,
    }),
  );
});

test('save from the card, find it in the panel, keep it across a reload, remove it with confirmation', async ({
  page,
}, testInfo) => {
  await page.goto(KARACHI);
  const panel = page.getByTestId('favourites');
  const star = page.getByRole('button', { name: 'Save Karachi as a favourite' });
  /** On a phone the full list, with its remove buttons, is behind Edit. */
  const openList = async () => {
    if (isPhone(testInfo.project.name)) await panel.getByRole('button', { name: 'Edit' }).click();
  };

  await expect(panel).toContainText('Tap the star on a city');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('1 of 5');

  // Visible at once on every width: as a tap target on a phone, as a list row otherwise.
  const row = panel.getByRole('button', { name: /^Karachi/ });
  await expect(row).toContainText('26°');
  await expect(row).toHaveAttribute('aria-current', 'true');
  await openList();
  await expect(panel.getByRole('button', { name: /^Karachi/ })).toContainText('Sindh, Pakistan');

  await page.reload();
  await expect(panel).toContainText('1 of 5');
  await openList();
  await expect(panel.getByRole('button', { name: /^Karachi/ })).toBeVisible();

  // First answer "Keep": nothing changes.
  const remove = panel.getByRole('button', { name: 'Remove Karachi from favourites' });
  await remove.click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove Karachi from favourites?' });
  await expect(dialog.getByRole('button', { name: 'Keep' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await expect(panel).toContainText('1 of 5');
  await expect(remove).toBeFocused();

  // Then confirm.
  await remove.click();
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(panel).toContainText('0 of 5');
  await expect(panel).toContainText('Tap the star on a city');
  await expect(panel.getByRole('heading', { name: 'Favourites' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Save Karachi as a favourite' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('a sixth city is refused, with the reason on screen', async ({ page }) => {
  await seedFavourites(page, LONG_NAMED);
  await page.goto(HONOLULU);
  const star = page.getByRole('button', { name: 'Save Honolulu as a favourite' });
  const reason = page.getByText('You’ve saved 5 of 5 cities. Remove one to add another.');

  await expect(reason.first()).toBeVisible();
  await expect(star).toHaveAttribute('aria-disabled', 'true');
  // Announced as unavailable, but still a real, focusable button: not the disabled attribute.
  await expect(star).not.toHaveAttribute('disabled');
  await star.focus();
  await expect(star).toBeFocused();

  await star.click({ force: true });

  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('favourites')).toContainText('5 of 5');
});

test('five long-named favourites never cause sideways scrolling', async ({ page }, testInfo) => {
  await seedFavourites(page, LONG_NAMED);
  await page.goto(KARACHI);
  const panel = page.getByTestId('favourites');
  await expect(panel).toContainText('5 of 5');
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  expect(await overflow()).toBeLessThanOrEqual(0);

  await expect(panel.getByRole('listitem')).toHaveCount(5);
  if (isPhone(testInfo.project.name)) {
    // Folded: two to a row, so five cities take three rows, not five.
    const folded = await panel.boundingBox();
    expect(folded?.height).toBeLessThanOrEqual(215);
    await panel.getByRole('button', { name: 'Edit' }).click();
  }
  await expect(panel.getByRole('listitem')).toHaveCount(5);
  await expect(panel.getByRole('listitem').first()).toContainText('26°');
  expect(await overflow()).toBeLessThanOrEqual(0);

  // Every row keeps a full-size remove button, however long the name beside it.
  for (const button of await panel.getByRole('button', { name: /^Remove / }).all()) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({
    path: `test-results/screens/favourites-open-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('on a 375x667 phone with five favourites, the current temperature is on the first screen', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'A phone-only constraint.');
  await page.setViewportSize({ width: 375, height: 667 });
  await seedFavourites(page, LONG_NAMED);
  await page.goto(KARACHI);

  const temperature = page.getByTestId('current-conditions').getByText('26°', { exact: true });
  await expect(temperature).toBeVisible();
  const box = await temperature.boundingBox();

  // Entirely above the fold, without scrolling.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(667);

  // And switching city is one tap, from the top of the page.
  const chip = page.getByTestId('favourites').getByRole('button', { name: /^Thiruvananthapuram/ });
  await expect(chip).toBeInViewport();
  await page.screenshot({ path: 'test-results/screens/favourites-375x667.png' });

  await chip.click();
  await expect(page).toHaveURL(/city=Thiruvananthapuram~Kerala~IN~/);
  await expect(chip).toHaveAttribute('aria-current', 'true');
});

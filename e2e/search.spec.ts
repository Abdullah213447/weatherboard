import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string): string =>
  readFileSync(new URL(`../tests/fixtures/geodb/${name}.json`, import.meta.url), 'utf8');

/** Recorded GeoDB bodies, chosen by the prefix being searched. */
const RESPONSES: Record<string, string> = {
  laho: fixture('cities-laho'),
  lond: fixture('cities-lond'),
  kara: fixture('cities-kara'),
};
const NO_RESULTS = fixture('cities-no-results');

/** Answers GeoDB from recordings and counts the requests that reached "the network". */
async function interceptGeoDb(page: Page): Promise<{ requests: string[] }> {
  const seen = { requests: [] as string[] };
  await page.route('https://wft-geo-db.p.rapidapi.com/**', async (route) => {
    const prefix = new URL(route.request().url()).searchParams.get('namePrefix') ?? '';
    seen.requests.push(prefix);
    const key = Object.keys(RESPONSES).find((name) => prefix.toLowerCase().startsWith(name));
    await route.fulfill({
      contentType: 'application/json',
      body: key ? (RESPONSES[key] ?? NO_RESULTS) : NO_RESULTS,
    });
  });
  return seen;
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures argument to be destructured.
test.beforeEach(({}, testInfo) => {
  test.skip(
    !['mobile', 'desktop'].includes(testInfo.project.name),
    'The search flow is checked at 375 and 1280.',
  );
});

test('type, arrow down, Enter: the city is selected and the URL updated', async ({ page }) => {
  await interceptGeoDb(page);
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a city' });

  await search.fill('Laho');
  const options = page.getByRole('option');
  await expect(options.first()).toContainText('Lahore');
  await expect(options.first()).toContainText('Punjab, Pakistan');
  await expect(options).toHaveCount(5);

  // The open list must not push the page sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /option-0$/);
  await search.press('Enter');

  await expect(page).toHaveURL(/[?&]city=Lahore~Punjab~PK~/);
  await expect(page.getByRole('heading', { level: 2, name: 'Lahore' })).toBeVisible();
  await expect(search).toHaveValue('Lahore');
  await expect(options).toHaveCount(0);
});

test('the selected city survives a reload and the back button returns to the start', async ({
  page,
}) => {
  await interceptGeoDb(page);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search for a city' }).fill('Lond');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/city=London~England~GB~/);

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'London' })).toBeVisible();

  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Find a city to see its weather.' }),
  ).toBeVisible();
});

test('a suggested-city chip runs a search and selects the top match', async ({ page }) => {
  const geodb = await interceptGeoDb(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Karachi' }).click();

  await expect(page).toHaveURL(/city=Karachi~Sindh~PK~/);
  await expect(page.getByRole('heading', { level: 2, name: 'Karachi' })).toBeVisible();
  expect(geodb.requests).toEqual(['Karachi']);
});

test('fast typing sends one request, and a repeated query sends none', async ({ page }) => {
  const geodb = await interceptGeoDb(page);
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a city' });

  await search.pressSequentially('Laho', { delay: 30 });
  await expect(page.getByRole('option').first()).toContainText('Lahore');
  expect(geodb.requests).toEqual(['Laho']);

  await search.fill('');
  await search.pressSequentially('Laho', { delay: 30 });
  await expect(page.getByRole('option').first()).toContainText('Lahore');
  expect(geodb.requests).toEqual(['Laho']);
});

test('no match and a too-short entry each explain themselves', async ({ page }) => {
  await interceptGeoDb(page);
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a city' });

  await search.fill('Zzqxv');
  await expect(page.getByText(/No cities match .Zzqxv.\. Check the spelling/)).toBeVisible();

  await search.fill('Z');
  await search.press('Enter');
  await expect(page.getByText('Type at least 2 letters')).toBeVisible();
  await expect(search).toHaveAttribute('aria-invalid', 'true');
});

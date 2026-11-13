import { expect, test } from '@playwright/test';

// Runs once per project (375, 768 and 1280 px wide) and once per colour scheme.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test('follows the system theme and never scrolls sideways', async ({ page }, testInfo) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await page.screenshot({
        path: `test-results/screens/${testInfo.project.name}-${scheme}.png`,
        fullPage: true,
      });
    });
  });
}

test('every interactive element is at least 44x44 at 375px, with touch or a mouse', async ({
  page,
}, testInfo) => {
  test.skip(
    !['mobile', 'mobile-fine'].includes(testInfo.project.name),
    'The 44px minimum applies below 768px.',
  );
  await page.goto('/');

  // Radio inputs are visually hidden; their labels are the real targets.
  const targets = page.locator('button, a[href], input:not([type="radio"]), label:has(input)');
  const boxes = await targets.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        // Skip elements that are only revealed on focus, such as the skip link.
        return rect.width > 1 && rect.height > 1;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: (element.getAttribute('placeholder') ?? element.textContent).trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
  );

  expect(boxes.length).toBeGreaterThan(5);
  for (const box of boxes) {
    expect(box.width, `${box.name} is ${String(box.width)}px wide`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${box.name} is ${String(box.height)}px tall`).toBeGreaterThanOrEqual(44);
  }
});

test('a chosen theme is applied before the app script runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('label[title="Dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Reload with the app bundle blocked: only the inline head script can set the theme now.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the UI preview is not reachable in a production build', async ({ page }) => {
  await page.goto('/?preview=ui');

  await expect(page.getByRole('heading', { level: 1, name: 'WeatherBoard' })).toBeVisible();
  await expect(page.getByText('UI preview')).toHaveCount(0);
});

test('compact 36px controls appear only on a wide screen with a precise pointer', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const height = await page
    .locator('label[title="Dark"]')
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));

  expect(height).toBe(['tablet', 'desktop'].includes(testInfo.project.name) ? 36 : 44);
});

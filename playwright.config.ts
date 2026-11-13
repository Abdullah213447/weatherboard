import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The three widths the app must hold up at.
const viewports = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: viewports.mobile, hasTouch: true },
    },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: viewports.tablet } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: viewports.desktop } },
  ],
  // E2E runs against the production build, because the service worker only exists there.
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});

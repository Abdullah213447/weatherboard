/**
 * Generates the PWA's raster assets from their sources:
 *
 *   node scripts/generate-pwa-assets.mjs                 icons only
 *   node scripts/generate-pwa-assets.mjs http://localhost:5173   icons and manifest screenshots
 *
 * Icons are rendered from src/assets/app-mark.svg. Screenshots are taken from
 * the running app, with weather answered from the recorded Karachi fixture so
 * they are reproducible. Run it again whenever the mark or the layout changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const INK = '#1a1a18';
const mark = read('src/assets/app-mark.svg')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const markBody = mark.replace(/<svg[^>]*>/, '').replace('</svg>', '');

/** The mark on its tile. `scale` shrinks the drawing; `radius` rounds the tile. */
const tile = ({ scale, radius }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${INK}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${markBody}</g>
</svg>`;

const ICONS = [
  // "any" purpose: our own rounded tile, transparent corners.
  {
    file: 'public/icons/icon-192.png',
    size: 192,
    svg: tile({ scale: 0.82, radius: 112 }),
    transparent: true,
  },
  {
    file: 'public/icons/icon-512.png',
    size: 512,
    svg: tile({ scale: 0.82, radius: 112 }),
    transparent: true,
  },
  // Maskable: full bleed, with the drawing inside the central 80% safe zone
  // (a circle of radius 40%), so any platform mask can crop it.
  {
    file: 'public/icons/icon-maskable-512.png',
    size: 512,
    svg: tile({ scale: 0.6, radius: 0 }),
    transparent: false,
  },
  // iOS draws its own rounded corners and shows transparency as black.
  {
    file: 'public/icons/apple-touch-icon.png',
    size: 180,
    svg: tile({ scale: 0.74, radius: 0 }),
    transparent: false,
  },
];

const browser = await chromium.launch();

for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await page.setContent(
    `<style>html,body{margin:0;background:${icon.transparent ? 'transparent' : INK}}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${icon.svg}`,
  );
  await page.screenshot({
    path: new URL(icon.file, root).pathname,
    omitBackground: icon.transparent,
  });
  await page.close();
  console.log('wrote', icon.file);
}

writeFileSync(
  new URL('public/favicon.svg', root),
  tile({ scale: 0.82, radius: 112 }).trim() + '\n',
);
console.log('wrote public/favicon.svg');

const baseUrl = process.argv[2];
if (baseUrl) {
  const current = read('tests/fixtures/openweathermap/current-karachi.json');
  const forecast = read('tests/fixtures/openweathermap/forecast-karachi.json');
  const recordedAt = JSON.parse(current).dt * 1000;
  // A daytime moment on the recorded day, so the card shows its light, tinted form.
  const noon = recordedAt + 10 * 60 * 60 * 1000;
  const favourites = [
    ['Karachi', 'Sindh', 'Pakistan', 'PK', 24.8607, 67.0011],
    ['Lahore', 'Punjab', 'Pakistan', 'PK', 31.4167, 74.3333],
    ['Tokyo', 'Tokyo', 'Japan', 'JP', 35.6762, 139.6503],
    ['London', 'England', 'United Kingdom', 'GB', 51.5072, -0.1275],
  ].map(([name, region, country, countryCode, lat, lon]) => ({
    id: `${countryCode}:${lat.toFixed(2)},${lon.toFixed(2)}`,
    name,
    region,
    country,
    countryCode,
    coords: { lat, lon },
  }));

  const SHOTS = [
    { file: 'public/screenshots/narrow.png', width: 390, height: 844, scale: 2 },
    { file: 'public/screenshots/wide.png', width: 1280, height: 800, scale: 1 },
  ];
  for (const shot of SHOTS) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: shot.scale,
      locale: 'en-GB',
      reducedMotion: 'reduce',
    });
    await page.clock.setFixedTime(new Date(noon));
    await page.route('https://api.openweathermap.org/**', (route) => {
      const isForecast = route.request().url().includes('/forecast?');
      const body = JSON.parse(isForecast ? forecast : current);
      // Present the recorded reading as a daytime one, to match the clock above.
      if (!isForecast) {
        body.dt = noon / 1000;
        body.weather[0] = {
          ...body.weather[0],
          id: 800,
          main: 'Clear',
          description: 'clear sky',
          icon: '01d',
        };
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.addInitScript(
      (value) => {
        localStorage.setItem('wb:favourites', value);
        localStorage.setItem('wb:install-dismissed', '1');
      },
      JSON.stringify({ version: 1, cities: favourites }),
    );
    await page.goto(`${baseUrl}/?city=Karachi~Sindh~PK~24.8607~67.0011`);
    await page.getByTestId('weather-status').filter({ hasText: 'Updated' }).waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: new URL(shot.file, root).pathname });
    await page.close();
    console.log('wrote', shot.file, `${shot.width * shot.scale}x${shot.height * shot.scale}`);
  }
}

await browser.close();

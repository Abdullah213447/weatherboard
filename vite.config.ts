import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own worker (src/sw.ts) with the precache list injected at build time.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registered from the app (features/pwa), so the update prompt is ours.
      injectRegister: false,
      registerType: 'prompt',
      devOptions: { enabled: false },
      injectManifest: {
        // The shell only. Of the font, just the Latin files; other scripts load on demand.
        globPatterns: [
          '**/*.{js,css,html}',
          'favicon.svg',
          'icons/*.png',
          'assets/inter-latin-*.woff2',
        ],
        // Shown by the browser's install dialog, never by the app itself.
        globIgnores: ['screenshots/**'],
      },
      manifest: {
        id: '/',
        name: 'WeatherBoard',
        short_name: 'WeatherBoard',
        description:
          'A calm weather dashboard: current conditions and a five-day forecast for any city, with favourites, and the last city you viewed available offline.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The canvas colour of the light theme (--wb-canvas). The running app
        // then keeps the theme-color meta in step with the active theme.
        theme_color: '#f7f7f5',
        background_color: '#f7f7f5',
        categories: ['weather', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/screenshots/narrow.png',
            sizes: '780x1688',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Current conditions and favourites on a phone',
          },
          {
            src: '/screenshots/wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'The dashboard: current conditions, five-day forecast and favourites',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@fixtures': fileURLToPath(new URL('./tests/fixtures', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Tests must behave the same on every machine: never read real keys from .env.local.
    env: { VITE_OPENWEATHER_API_KEY: '', VITE_RAPIDAPI_KEY: '' },
    // The server functions under /api are tested by the same run.
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
    // The token contrast test reads tokens.css as text; without this Vitest stubs every CSS import.
    css: { include: /tokens\.css/ },
  },
});

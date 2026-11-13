import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    include: ['src/**/*.test.{ts,tsx}'],
    // The token contrast test reads tokens.css as text; without this Vitest stubs every CSS import.
    css: { include: /tokens\.css/ },
  },
});

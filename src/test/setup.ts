import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// The test browser claims a US locale, which would default every test to
// Fahrenheit. Tests assume a metric locale unless they say otherwise.
Object.defineProperty(window.navigator, 'language', { get: () => 'en-GB', configurable: true });

// A request with no handler is a test bug: fail loudly instead of hitting the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

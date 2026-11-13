import { setupServer } from 'msw/node';

/**
 * Network stub for unit and component tests only. It is never imported by
 * application code, so no mock data can reach the production bundle.
 * Handlers are registered per test with `server.use(...)`, replaying
 * responses recorded from the real APIs (see tests/fixtures).
 */
export const server = setupServer();

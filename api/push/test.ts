import { waitUntil } from '@vercel/functions';
import { createDeps } from '../_lib/deps.js';
import { handleTest, safely } from '../_lib/handlers.js';

/** Sends one reminder about ten seconds from now, to a subscription that is already stored. */
export function POST(request: Request): Promise<Response> {
  return safely(() => handleTest(request, createDeps(), waitUntil));
}

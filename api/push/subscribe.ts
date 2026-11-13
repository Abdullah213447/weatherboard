import { createDeps } from '../_lib/deps.js';
import { handleSubscribe, handleUnsubscribe, safely } from '../_lib/handlers.js';

/** Creates or updates this browser's daily reminder. */
export function POST(request: Request): Promise<Response> {
  return safely(() => handleSubscribe(request, createDeps()));
}

/** Removes this browser's reminder. */
export function DELETE(request: Request): Promise<Response> {
  return safely(() => handleUnsubscribe(request, createDeps()));
}

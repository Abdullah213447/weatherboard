import { createDeps, createSignatureVerifier } from '../_lib/deps.js';
import { handleDispatch, safely } from '../_lib/handlers.js';

/** Called by the QStash schedule every five minutes. Sends whatever is due. */
export function POST(request: Request): Promise<Response> {
  return safely(() => handleDispatch(request, createDeps(), createSignatureVerifier()));
}

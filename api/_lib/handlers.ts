import type { VerifySignature } from './deps.js';
import { clientIp, isSameOrigin, json, parseJson, RATE_LIMIT, readBody } from './http.js';
import { dispatchDue, saveReminder, sendReminder, subscriptionId, type Deps } from './reminders.js';
import { endpointBody, NOT_ALLOWED, subscribeBody } from './schemas.js';
import type { z } from 'zod';

/**
 * The endpoints as plain functions of (request, dependencies), so they can be
 * tested without a server. Responses never contain a push address, a key or
 * any stored detail: outcomes and counts only.
 */

const TEST_DELAY_MS = 10_000;

/** Checks shared by everything a browser page calls: origin, size, rate. */
async function guard(request: Request, deps: Deps): Promise<Response | string> {
  if (!isSameOrigin(request)) {
    return json(403, {
      error: 'forbidden_origin',
      message: 'This endpoint only accepts requests from WeatherBoard itself.',
    });
  }
  if (!(await deps.store.allow(clientIp(request), RATE_LIMIT.limit, RATE_LIMIT.windowSeconds))) {
    return json(429, {
      error: 'rate_limited',
      message: 'Too many requests. Wait a minute and try again.',
    });
  }
  const text = await readBody(request);
  if (text === null) {
    return json(413, {
      error: 'body_too_large',
      message: 'The request body is larger than this endpoint accepts.',
    });
  }
  return text;
}

function invalid(error: z.ZodError): Response {
  const issues = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    problem: issue.message,
  }));
  if (issues.some((issue) => issue.problem === NOT_ALLOWED)) {
    return json(400, {
      error: NOT_ALLOWED,
      message:
        'The push address is not from a browser push service this app recognises, so it was not stored.',
    });
  }
  return json(400, {
    error: 'invalid_body',
    message: 'The request is missing a field or has one in the wrong form.',
    fields: issues.map((issue) => `${issue.field || '(body)'}: ${issue.problem}`),
  });
}

export async function handleSubscribe(request: Request, deps: Deps): Promise<Response> {
  const text = await guard(request, deps);
  if (typeof text !== 'string') return text;
  const parsed = subscribeBody.safeParse(parseJson(text));
  if (!parsed.success) return invalid(parsed.error);

  const { outcome, nextFireAt } = await saveReminder(deps, parsed.data);
  if (outcome === 'full') {
    return json(503, {
      error: 'at_capacity',
      message: 'Reminders are fully subscribed for now. Try again another day.',
    });
  }
  return json(outcome === 'created' ? 201 : 200, { ok: true, nextFireAt });
}

export async function handleUnsubscribe(request: Request, deps: Deps): Promise<Response> {
  const text = await guard(request, deps);
  if (typeof text !== 'string') return text;
  const parsed = endpointBody.safeParse(parseJson(text));
  if (!parsed.success) return invalid(parsed.error);

  await deps.store.remove(subscriptionId(parsed.data.endpoint));
  // The same answer whether or not it existed: nothing to learn by probing.
  return json(200, { ok: true });
}

/**
 * Sends a real reminder, a few seconds from now, to a subscription that is
 * already stored. The delay is the point: it gives the user time to close the
 * tab and see the notification arrive without it.
 */
export async function handleTest(
  request: Request,
  deps: Deps,
  /** Keeps the function alive after the response has been sent. */
  runAfterResponse: (work: Promise<unknown>) => void,
  delayMs = TEST_DELAY_MS,
): Promise<Response> {
  const text = await guard(request, deps);
  if (typeof text !== 'string') return text;
  const parsed = endpointBody.safeParse(parseJson(text));
  if (!parsed.success) return invalid(parsed.error);

  const record = await deps.store.get(subscriptionId(parsed.data.endpoint));
  if (!record) {
    return json(404, {
      error: 'not_subscribed',
      message: 'No reminder is stored for this browser. Turn the reminder on first.',
    });
  }

  runAfterResponse(
    new Promise((resolve) => setTimeout(resolve, delayMs)).then(async () => {
      const result = await sendReminder(deps, record);
      if (result === 'gone') await deps.store.remove(record.id);
    }),
  );
  return json(202, { ok: true, arrivesInSeconds: Math.round(delayMs / 1000) });
}

export async function handleDispatch(
  request: Request,
  deps: Deps,
  verify: VerifySignature,
): Promise<Response> {
  // The signature covers the exact bytes sent, so the body is read raw and never re-serialised.
  const rawBody = await request.text();
  const signature = request.headers.get('upstash-signature');
  if (!signature || !(await verify(signature, rawBody))) {
    return json(401, {
      error: 'invalid_signature',
      message: 'This endpoint only accepts signed requests from the scheduler.',
    });
  }
  return json(200, { ok: true, ...(await dispatchDue(deps)) });
}

/** Turns an unexpected failure into a response that says nothing about why. */
export async function safely(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    // Message only: never the request, a subscription or an environment value.
    console.error('[reminders]', error instanceof Error ? error.message : 'unknown failure');
    return json(500, {
      error: 'server_error',
      message: 'The reminder service could not complete the request.',
    });
  }
}

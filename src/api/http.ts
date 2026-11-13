import { AppError, type AppErrorSource } from '@/domain/errors';

export type FetchJsonOptions = {
  /** Which service this is, so a failure can say what failed. */
  source: AppErrorSource;
  /** Cancels the request, for example when the user types another letter. */
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export type FetchJson = (url: string, options: FetchJsonOptions) => Promise<unknown>;

export type HttpDeps = {
  fetch: typeof fetch;
  /** The browser's own view of connectivity, used to tell offline from blocked. */
  isOnline: () => boolean;
};

export const DEFAULT_TIMEOUT_MS = 8000;

function errorFromStatus(response: Response, source: AppErrorSource): AppError {
  const detail = `HTTP ${String(response.status)}`;
  switch (true) {
    case response.status === 401 || response.status === 403:
      return new AppError('auth', source, { detail });
    case response.status === 404:
      return new AppError('not-found', source, { detail });
    case response.status === 408:
      return new AppError('timeout', source, { detail });
    case response.status === 429: {
      const seconds = Number(response.headers.get('retry-after'));
      return new AppError('rate-limited', source, {
        detail,
        ...(Number.isFinite(seconds) && seconds > 0 && { retryAfterMs: seconds * 1000 }),
      });
    }
    case response.status >= 500:
      return new AppError('provider-down', source, { detail });
    default:
      // Any other 4xx means we sent something the service did not accept.
      return new AppError('bad-response', source, { detail });
  }
}

/**
 * GETs a URL and returns the parsed JSON body, or throws an AppError that
 * says which service failed and how. A request cancelled by the caller
 * rethrows the abort untouched: that is not a failure to report.
 */
export function createFetchJson(deps: HttpDeps): FetchJson {
  return async (url, { source, signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers }) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => {
      controller.abort();
    };
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    const classify = (cause: unknown, otherwise: () => AppError): Error => {
      if (timedOut) return new AppError('timeout', source, { cause });
      if (signal?.aborted) {
        return cause instanceof Error ? cause : new DOMException('Aborted', 'AbortError');
      }
      return otherwise();
    };

    try {
      let response: Response;
      try {
        response = await deps.fetch(url, {
          signal: controller.signal,
          ...(headers && { headers }),
        });
      } catch (cause) {
        // fetch rejects without a status when nothing came back at all.
        throw classify(
          cause,
          () => new AppError(deps.isOnline() ? 'network' : 'offline', source, { cause }),
        );
      }

      if (!response.ok) throw errorFromStatus(response, source);

      try {
        return (await response.json()) as unknown;
      } catch (cause) {
        throw classify(
          cause,
          () => new AppError('bad-response', source, { cause, detail: 'body is not JSON' }),
        );
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  };
}

export const fetchJson: FetchJson = createFetchJson({
  fetch: (input, init) => globalThis.fetch(input, init),
  isOnline: () => navigator.onLine,
});

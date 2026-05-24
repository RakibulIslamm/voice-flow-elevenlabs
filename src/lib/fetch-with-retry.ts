import { ExternalServiceError } from '@/lib/errors';

export type FetchWithRetryOptions = RequestInit & {
  service: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const {
    service,
    timeoutMs = 15_000,
    maxRetries = 3,
    initialDelayMs = 200,
    signal: externalSignal,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = mergeSignals(externalSignal, controller.signal);

    try {
      const res = await fetch(input, { ...init, signal });
      clearTimeout(timeoutId);

      if (res.status >= 500 || res.status === 429) {
        if (attempt < maxRetries) {
          await sleep(backoff(attempt, initialDelayMs));
          continue;
        }
        throw new ExternalServiceError(service, `${service} returned HTTP ${res.status}`);
      }

      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      if (e instanceof ExternalServiceError) throw e;
      if (externalSignal?.aborted) throw e;
      if (attempt < maxRetries) {
        await sleep(backoff(attempt, initialDelayMs));
        continue;
      }
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : `Unknown ${service} fetch failure`;
  throw new ExternalServiceError(service, reason);
}

function backoff(attempt: number, baseMs: number) {
  return baseMs * 2 ** attempt + Math.floor(Math.random() * 100);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function mergeSignals(
  external: AbortSignal | null | undefined,
  internal: AbortSignal,
): AbortSignal {
  if (!external) return internal;
  if (external.aborted) return external;
  const merged = new AbortController();
  const onAbort = () => merged.abort();
  external.addEventListener('abort', onAbort, { once: true });
  internal.addEventListener('abort', onAbort, { once: true });
  return merged.signal;
}

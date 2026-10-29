import { cacheGet, cachePut } from '../db';
import { currentContext, sleep } from '../context';

export class WeatherApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;
const RETRIES = 2;

/**
 * Fetches JSON from Open-Meteo with a timeout, retries with backoff (honoring Retry-After on 429),
 * and a persistent cache. When the API fails, a stale cached copy is returned instead of an error
 * ("stale if error"), and the run is marked so the answer can say the data may be out of date.
 */
export async function fetchJson<T>(url: string, ttlMs: number): Promise<T> {
  const cached = cacheGet<T>(url);
  if (cached?.fresh) return cached.value;

  try {
    const value = await fetchWithRetry<T>(url);
    cachePut(url, value, ttlMs);
    return value;
  } catch (error) {
    if (cached) {
      currentContext().usedStaleData = true;
      return cached.value;
    }
    throw error;
  }
}

async function fetchWithRetry<T>(url: string): Promise<T> {
  const { faults } = currentContext();
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    try {
      if (faults.has('weather_slow')) await sleep(4000);
      if (faults.has('weather_error')) throw new WeatherApiError('Simulated weather API failure', 503);

      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return (await res.json()) as T;

      const body = await res.text();
      const reason = safeReason(body) ?? res.statusText;
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after'));
        if (attempt < RETRIES && Number.isFinite(wait) && wait <= 5) await sleep(wait * 1000);
        lastError = new WeatherApiError('The weather service is rate-limiting requests right now', 429);
        continue;
      }
      if (res.status >= 500) {
        lastError = new WeatherApiError(`The weather service failed (${res.status})`, res.status);
        continue;
      }
      // 4xx other than 429: the request itself is wrong, retrying will not help.
      throw new WeatherApiError(reason, res.status);
    } catch (error) {
      if (error instanceof WeatherApiError && error.status && error.status < 500 && error.status !== 429) throw error;
      lastError =
        error instanceof WeatherApiError
          ? error
          : new WeatherApiError(error instanceof Error && error.name === 'TimeoutError' ? 'The weather service timed out' : 'The weather service is unreachable');
    }
  }
  throw lastError;
}

function safeReason(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { reason?: string };
    return parsed.reason;
  } catch {
    return undefined;
  }
}

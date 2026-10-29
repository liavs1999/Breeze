import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithContext, type RunContext } from '../src/context';
import { cachePut } from '../src/db';
import { fetchJson, WeatherApiError } from '../src/weather/http';

const ctx = (): RunContext => ({ units: 'metric', faults: new Set(), usedStaleData: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('weather HTTP client', () => {
  it('retries a failing server and returns the eventual answer', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: true }, 503)).mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const value = await runWithContext(ctx(), () => fetchJson<{ ok: number }>('https://example.test/retry', 1000));
    expect(value).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a bad request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: true, reason: 'Invalid date' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runWithContext(ctx(), () => fetchJson('https://example.test/bad', 1000))).rejects.toThrow('Invalid date');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale cached copy when the API is down, and marks the answer', async () => {
    const url = 'https://example.test/stale';
    cachePut(url, { cached: true }, -1); // already expired
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: true }, 503)));
    const c = ctx();
    const value = await runWithContext(c, () => fetchJson(url, 1000));
    expect(value).toEqual({ cached: true });
    expect(c.usedStaleData).toBe(true);
  });

  it('fails clearly when the API is down and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(runWithContext(ctx(), () => fetchJson('https://example.test/down', 1000))).rejects.toBeInstanceOf(WeatherApiError);
  });

  it('honors the simulated weather failure', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c: RunContext = { ...ctx(), faults: new Set(['weather_error']) };
    await expect(runWithContext(c, () => fetchJson('https://example.test/fault', 1000))).rejects.toThrow(/Simulated/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

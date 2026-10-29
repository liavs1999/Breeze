import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithContext, type RunContext } from '../src/context';
import { searchPlaces } from '../src/weather/openmeteo';

const ctx = (): RunContext => ({ units: 'metric', faults: new Set(), usedStaleData: false });
const geo = (results: object[]) => new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } });
const place = (name: string, admin1: string, country: string, country_code: string) => ({ name, admin1, country, country_code, latitude: 0, longitude: 0, timezone: 'UTC' });

const SPRINGFIELDS = [
  place('Springfield', 'Missouri', 'United States', 'US'),
  place('Springfield', 'Illinois', 'United States', 'US'),
  place('Springfield', 'Ohio', 'United States', 'US'),
];
const MOSCOWS = [place('Moscow', 'Moscow', 'Russia', 'RU'), place('Moscow', 'Idaho', 'United States', 'US')];

afterEach(() => vi.unstubAllGlobals());

const first = async (query: string, results: object[]) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geo(results)));
  return (await runWithContext(ctx(), () => searchPlaces(query)))[0];
};

describe('place search hints', () => {
  it('uses every hint, so region and country together pick the right place', async () => {
    expect((await first('Springfield, Ohio, United States', SPRINGFIELDS)).admin1).toBe('Ohio');
    expect((await first('Springfield, Illinois', SPRINGFIELDS)).admin1).toBe('Illinois');
  });

  it('matches a country code exactly, not as part of another name', async () => {
    expect((await first('Moscow, US', MOSCOWS)).admin1).toBe('Idaho');
  });

  it('keeps the most relevant result when a hint matches nothing', async () => {
    expect((await first('Springfield, Atlantis', SPRINGFIELDS)).admin1).toBe('Missouri');
  });
});

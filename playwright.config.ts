import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the production build, served by the real server on one port, with the
 * scripted model (no key, deterministic, slow enough to reload mid-answer) and real weather data.
 */
const PORT = 8799;
const db = join(tmpdir(), `breeze-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The installed Chrome; set PW_CHANNEL=chromium to use Playwright's own browser instead.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build -w client && API_PORT=${PORT} SCRIPTED_MODEL=true ALLOW_FAULTS=true DB_PATH=${db} npx tsx server/src/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
  },
});

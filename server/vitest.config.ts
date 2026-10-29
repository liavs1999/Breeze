import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { DB_PATH: join(tmpdir(), `atmos-test-${process.pid}.db`), LLM_PROVIDER: '', NODE_ENV: 'test' },
  },
});

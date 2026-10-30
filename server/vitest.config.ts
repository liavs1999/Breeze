import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { DB_PATH: join(tmpdir(), `breeze-test-${process.pid}.db`), NODE_ENV: 'test' },
  },
});

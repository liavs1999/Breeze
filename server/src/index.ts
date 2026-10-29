import { serve } from '@hono/node-server';
import { app } from './app';
import { config } from './config';
import { closeDb, pruneCache } from './db';
import { log } from './log';
import { drainRuns } from './streams';

pruneCache();
const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  log('server.start', {
    port,
    serverKey: config.serverKey ? `${config.serverKey.provider}/${config.serverKey.model}` : 'none',
    faults: config.allowFaults,
  });
});

/** Graceful shutdown: stop taking requests, let running answers finish (up to 20 s), then exit. */
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log('server.stop', { signal });
  server.close();
  await drainRuns(20_000);
  closeDb();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

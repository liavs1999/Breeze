import { AsyncLocalStorage } from 'node:async_hooks';
import type { Fault, UnitSystem } from '@wwa/shared';

/** Per-answer context, available to tools and the HTTP layer without threading it through every call. */
export interface RunContext {
  units: UnitSystem;
  faults: Set<Fault>;
  /** Set when an answer used cached data because the weather API failed. */
  usedStaleData: boolean;
}

const storage = new AsyncLocalStorage<RunContext>();

export function runWithContext<T>(ctx: RunContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RunContext {
  return storage.getStore() ?? { units: 'metric', faults: new Set(), usedStaleData: false };
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/**
 * Resumable answer streams. Each answer runs on the server independently of the browser connection:
 * its server-sent events are buffered here, and any number of clients can attach. A client that
 * reloads (or reconnects after a network drop) attaches again and gets the full replay followed by
 * the live events, so the answer finishes in place exactly once.
 *
 * Single process, so the buffer lives in memory. With several servers it would move to Redis
 * (the `resumable-stream` package implements the same idea).
 */
export interface Run {
  chatId: string;
  startedAt: number;
  chunks: string[];
  done: boolean;
  abort: AbortController;
  listeners: Set<() => void>;
}

const runs = new Map<string, Run>();
/** Finished runs stay attachable briefly, for a client that loaded the page just before the end. */
const KEEP_FINISHED_MS = 60_000;

export function activeRun(chatId: string): Run | undefined {
  const run = runs.get(chatId);
  return run && !run.done ? run : undefined;
}

export function attachableRun(chatId: string): Run | undefined {
  return runs.get(chatId);
}

export function startRun(chatId: string, abort: AbortController, source: ReadableStream<string>): Run {
  const run: Run = { chatId, startedAt: Date.now(), chunks: [], done: false, abort, listeners: new Set() };
  runs.set(chatId, run);
  const notify = () => run.listeners.forEach((fn) => fn());

  void (async () => {
    const reader = source.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        run.chunks.push(value);
        notify();
      }
    } catch (error) {
      console.error(`[run ${chatId}] stream failed`, error);
      run.chunks.push(`data: ${JSON.stringify({ type: 'error', errorText: 'error|The answer stopped unexpectedly.' })}\n\n`);
    } finally {
      run.done = true;
      notify();
      setTimeout(() => runs.get(chatId) === run && runs.delete(chatId), KEEP_FINISHED_MS).unref();
    }
  })();
  return run;
}

/**
 * A stream for one client: the replay of everything so far, then live events until the run ends.
 * Cancelling it (the browser went away) never affects the run. `dropAfterMs` cuts this client's
 * connection on purpose, for the "dropped connection" fault.
 */
export function subscribe(run: Run, { dropAfterMs }: { dropAfterMs?: number } = {}): ReadableStream<Uint8Array> {
  let index = 0;
  let closed = false;
  let flush = () => {};

  const stream = new ReadableStream<string>({
    start(controller) {
      flush = () => {
        if (closed) return;
        while (index < run.chunks.length) controller.enqueue(run.chunks[index++]);
        if (run.done) {
          closed = true;
          run.listeners.delete(flush);
          controller.close();
        }
      };
      run.listeners.add(flush);
      flush();
      if (dropAfterMs) {
        setTimeout(() => {
          if (closed || run.done) return;
          closed = true;
          run.listeners.delete(flush);
          controller.error(new Error('Simulated dropped connection'));
        }, dropAfterMs).unref();
      }
    },
    cancel() {
      closed = true;
      run.listeners.delete(flush);
    },
  });
  return stream.pipeThrough(new TextEncoderStream());
}

/** For graceful shutdown: wait until running answers finish (or the deadline passes). */
export async function drainRuns(deadlineMs: number): Promise<void> {
  const until = Date.now() + deadlineMs;
  while ([...runs.values()].some((r) => !r.done) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

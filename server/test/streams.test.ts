import { describe, expect, it } from 'vitest';
import { attachableRun, startRun, subscribe } from '../src/streams';

/** A source the test controls: push events, then end. */
function controlledSource() {
  let controller!: ReadableStreamDefaultController<string>;
  const stream = new ReadableStream<string>({ start: (c) => void (controller = c) });
  return { stream, push: (s: string) => controller.enqueue(s), end: () => controller.close() };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of stream as any) out += decoder.decode(chunk);
  return out;
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('resumable streams', () => {
  it('replays everything to a client that attaches late, then continues live', async () => {
    const src = controlledSource();
    const run = startRun('chat-a', new AbortController(), src.stream);
    src.push('one;');
    src.push('two;');
    await tick();

    const late = readAll(subscribe(run));
    src.push('three;');
    src.end();
    expect(await late).toBe('one;two;three;');
  });

  it('keeps the answer running when a client goes away', async () => {
    const src = controlledSource();
    const run = startRun('chat-b', new AbortController(), src.stream);
    const reader = subscribe(run).getReader();
    src.push('a;');
    await reader.read();
    await reader.cancel(); // the browser tab closed
    src.push('b;');
    src.end();
    await tick();
    expect(run.done).toBe(true);
    expect(run.chunks.join('')).toBe('a;b;');
    // A new client (after a reload) still gets the whole answer.
    expect(await readAll(subscribe(attachableRun('chat-b')!))).toBe('a;b;');
  });

  it('serves several clients the same events', async () => {
    const src = controlledSource();
    const run = startRun('chat-c', new AbortController(), src.stream);
    const first = readAll(subscribe(run));
    const second = readAll(subscribe(run));
    src.push('x;');
    src.push('y;');
    src.end();
    expect(await first).toBe('x;y;');
    expect(await second).toBe('x;y;');
  });

  it('drops one connection on purpose without affecting the run (fault injection)', async () => {
    const src = controlledSource();
    const run = startRun('chat-d', new AbortController(), src.stream);
    src.push('start;');
    const dropped = readAll(subscribe(run, { dropAfterMs: 20 }));
    await expect(dropped).rejects.toThrow(/Simulated dropped connection/);
    src.push('end;');
    src.end();
    expect(await readAll(subscribe(run))).toBe('start;end;');
  });
});

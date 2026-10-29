import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { z } from 'zod';
import { FAULT_HEADER, FAULTS, keyCheckRequest, type Fault, type Health } from '@wwa/shared';
import { config } from './config';
import { deleteChat, getChat, listChats, saveChat } from './db';
import { log } from './log';
import { createLimiter } from './ratelimit';
import { activeRun, attachableRun, subscribe } from './streams';
import { checkKey } from './agent/keycheck';
import { chooseModel } from './agent/models';
import { startAnswer, type ChatMessage } from './agent/run';

const chatId = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);
const chatRequest = z.object({
  id: chatId,
  message: z.object({ id: z.string().max(100), role: z.literal('user'), parts: z.array(z.any()).max(20) }).passthrough(),
  trigger: z.enum(['submit-message', 'regenerate-message']).default('submit-message'),
  units: z.enum(['metric', 'imperial']).default('metric'),
  timezone: z.string().max(64).optional(),
});
const MAX_MESSAGE_CHARS = 2000;

const demoLimiter = createLimiter(config.demoAnswersPerHour, 3600_000);
const keyCheckLimiter = createLimiter(12, 60_000);

const visitor = (c: Context) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || (c.env as any)?.incoming?.socket?.remoteAddress || 'local';

function faultsOf(c: Context): Set<Fault> {
  if (!config.allowFaults) return new Set();
  const raw = c.req.header(FAULT_HEADER) ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter((f): f is Fault => (FAULTS as readonly string[]).includes(f)));
}

export const app = new Hono();

app.get('/api/health', (c) =>
  c.json<Health>({
    ok: true,
    serverKey: config.serverKey ? { provider: config.serverKey.provider, model: config.serverKey.model } : null,
    faultsEnabled: config.allowFaults,
    version: config.version,
  }),
);

app.post('/api/keys/check', async (c) => {
  if (!keyCheckLimiter.take(visitor(c)).ok) return c.json({ error: 'Too many checks; wait a minute.' }, 429);
  const parsed = keyCheckRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const result = await checkKey(parsed.data);
  log('key.check', { provider: result.provider, model: result.model, status: result.status });
  return c.json(result);
});

app.get('/api/chats', (c) => c.json(listChats()));

app.get('/api/chats/:id', (c) => {
  const id = chatId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Invalid chat id' }, 400);
  const chat = getChat(id.data);
  return c.json({
    id: id.data,
    title: chat?.title ?? 'New chat',
    messages: chat?.messages ?? [],
    streaming: Boolean(activeRun(id.data)),
  });
});

app.delete('/api/chats/:id', (c) => {
  const id = chatId.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Invalid chat id' }, 400);
  activeRun(id.data)?.abort.abort();
  deleteChat(id.data);
  return c.body(null, 204);
});

/** Starts an answer and streams it. The answer keeps running if this connection drops. */
app.post('/api/chat', async (c) => {
  const parsed = chatRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_request', message: 'Invalid chat request.' }, 400);
  const { id, message, trigger, units, timezone } = parsed.data;

  const text = message.parts.filter((p: any) => p?.type === 'text').map((p: any) => String(p.text ?? '')).join('');
  if (trigger === 'submit-message' && !text.trim()) return c.json({ error: 'invalid_request', message: 'The message is empty.' }, 400);
  if (text.length > MAX_MESSAGE_CHARS) {
    return c.json({ error: 'too_long', message: `Messages are limited to ${MAX_MESSAGE_CHARS} characters.` }, 413);
  }
  if (activeRun(id)) return c.json({ error: 'busy', message: 'An answer is already being written in this chat.' }, 409);

  const choice = chooseModel(c.req.raw.headers);
  if (!choice) return c.json({ error: 'no_key', message: 'Add an API key to start.' }, 401);
  if (choice.origin === 'server') {
    const limit = demoLimiter.take(visitor(c));
    if (!limit.ok) {
      return c.json(
        { error: 'demo_limit', message: `The demo key's limit for this hour is reached. Add your own key, or wait ${Math.ceil(limit.retryAfterS / 60)} min.` },
        429,
      );
    }
  }

  // Build the conversation from storage: the client sends only its newest message.
  const stored = (getChat(id)?.messages ?? []) as ChatMessage[];
  let messages: ChatMessage[];
  if (trigger === 'regenerate-message') {
    const lastUser = stored.map((m) => m.role).lastIndexOf('user');
    messages = lastUser >= 0 ? stored.slice(0, lastUser + 1) : stored;
  } else if (stored.some((m) => m.id === message.id)) {
    // The same message sent again (a retry after a dropped request): never duplicate it.
    messages = stored.slice(0, stored.findIndex((m) => m.id === message.id) + 1);
  } else {
    messages = [...stored, message as ChatMessage];
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return c.json({ error: 'invalid_request', message: 'Nothing to answer.' }, 400);
  }
  saveChat(id, messages);

  try {
    const run = await startAnswer({ chatId: id, messages, choice, units, userTimezone: timezone, faults: faultsOf(c) });
    log('agent.start', { chat: id, provider: choice.provider, model: choice.model, key: choice.origin, faults: [...faultsOf(c)] });
    const dropAfterMs = faultsOf(c).has('drop_stream') ? 2500 : undefined;
    return new Response(subscribe(run, { dropAfterMs }), { headers: UI_MESSAGE_STREAM_HEADERS });
  } catch (error) {
    log('agent.start_failed', { chat: id, error: error instanceof Error ? error.message : String(error) });
    return c.json({ error: 'invalid_request', message: 'This conversation could not be read. Start a new chat.' }, 400);
  }
});

/** Reattaches to a running (or just finished) answer: full replay, then live. 204 when there is none. */
app.get('/api/chat/:id/stream', (c) => {
  const id = chatId.safeParse(c.req.param('id'));
  if (!id.success) return c.body(null, 400);
  const run = attachableRun(id.data);
  if (!run) return c.body(null, 204);
  return new Response(subscribe(run), { headers: UI_MESSAGE_STREAM_HEADERS });
});

/** Explicit stop: cancels the answer; the partial answer is saved. A refresh is not a stop. */
app.post('/api/chats/:id/stop', (c) => {
  const id = chatId.safeParse(c.req.param('id'));
  if (!id.success) return c.body(null, 400);
  activeRun(id.data)?.abort.abort();
  return c.body(null, 204);
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// In production the built client is served from the same port; index.html is never cached, so a new
// deploy is picked up on the next load, while hashed assets are cached for a year.
if (existsSync(join(config.staticDir, 'index.html'))) {
  const index = readFileSync(join(config.staticDir, 'index.html'), 'utf8');
  app.use(
    '/assets/*',
    serveStatic({ root: config.staticDir, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
  );
  app.use('*', serveStatic({ root: config.staticDir }));
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(index);
  });
}

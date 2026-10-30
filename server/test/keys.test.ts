import { describe, expect, it, vi } from 'vitest';
import { KEY_HEADERS } from '@breeze/shared';

// Two more keys "in server/.env", set before the config is read.
vi.stubEnv('GROQ_API_KEY', 'gsk-test-groq-1111');
vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-2222');
const { config } = await import('../src/config');
const { chooseModel } = await import('../src/agent/models');

const headers = (h: Record<string, string>) => new Headers(Object.fromEntries(Object.entries(h).map(([k, v]) => [KEY_HEADERS[k as keyof typeof KEY_HEADERS], v])));

describe('keys in server/.env', () => {
  it('reads one key per provider, each with its default model', () => {
    const anthropic = config.serverKeys.find((k) => k.provider === 'anthropic');
    expect(anthropic).toMatchObject({ key: 'sk-ant-test-2222', model: 'claude-haiku-4-5-20251001' });
    expect(config.serverKeys.find((k) => k.provider === 'groq')?.key).toBe('gsk-test-groq-1111');
  });

  it('answers with the key of the provider picked in the app, and its picked model', () => {
    expect(chooseModel(headers({ provider: 'anthropic' }))).toMatchObject({ provider: 'anthropic', key: 'sk-ant-test-2222', origin: 'server' });
    expect(chooseModel(headers({ provider: 'groq', model: 'openai/gpt-oss-20b' }))).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-20b' });
  });

  it('falls back to the first key, ignoring a model picked for another provider', () => {
    const first = config.serverKeys[0];
    expect(chooseModel(headers({ provider: 'openai', model: 'gpt-5.2' }))).toMatchObject({ provider: first.provider, model: first.model });
  });

  it('a pasted key always wins', () => {
    expect(chooseModel(headers({ provider: 'openai', key: 'sk-pasted-3333' }))).toMatchObject({ provider: 'openai', key: 'sk-pasted-3333', origin: 'user' });
  });
});

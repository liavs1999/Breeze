import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_INFO, PROVIDERS, type ProviderId } from '@breeze/shared';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, '..');

const envFile = resolve(SERVER_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

/** The variable that holds each provider's key in server/.env. */
const KEY_VARS: Record<ProviderId, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export interface ServerKey {
  provider: ProviderId;
  key: string;
  /** The model used unless another is picked in the app. */
  model: string;
}

/**
 * The keys in server/.env, one per provider; the app lets the user pick which one answers. The
 * end-to-end tests set SCRIPTED_MODEL=true instead: a deterministic stand-in model with no key
 * (never in production).
 */
function serverKeys(): ServerKey[] {
  if (env.SCRIPTED_MODEL === 'true' && !isProduction) return [{ provider: 'google', key: 'scripted', model: 'scripted' }];
  return PROVIDERS.filter((p) => env[KEY_VARS[p]]?.trim()).map((p) => ({ provider: p, key: env[KEY_VARS[p]]!.trim(), model: PROVIDER_INFO[p].defaultModel }));
}

const number = (name: string, fallback: number) => {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  isProduction,
  /** API_PORT wins over PORT, so a dev tool that sets PORT for the client cannot move the API. */
  port: number('API_PORT', number('PORT', 8787)),
  dbPath: resolve(SERVER_ROOT, env.DB_PATH || 'data/app.db'),
  /** Built client, served by this server in production (one port for everything). */
  staticDir: resolve(SERVER_ROOT, env.STATIC_DIR || '../client/dist'),
  serverKeys: serverKeys(),
  /** Failure injection for the browser tests, which set ALLOW_FAULTS=true; off otherwise. */
  allowFaults: env.ALLOW_FAULTS === 'true' && !isProduction,
  maxAgentSteps: number('MAX_AGENT_STEPS', 8),
  version: '1.0.0',
};

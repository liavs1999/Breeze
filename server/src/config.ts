import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_INFO, PROVIDERS, type ProviderId } from '@wwa/shared';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, '..');

const envFile = resolve(SERVER_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

/** Provider-specific key variables, plus one generic LLM_API_KEY that works for any provider. */
const KEY_VARS: Record<ProviderId, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

function serverKey(): { provider: ProviderId; key: string; model: string } | null {
  // The scripted test model (end-to-end tests): no key, never in production.
  if (env.LLM_PROVIDER === 'scripted' && !isProduction) return { provider: 'google', key: 'scripted', model: 'scripted' };
  const named = env.LLM_PROVIDER as ProviderId | undefined;
  const provider = named && PROVIDERS.includes(named) ? named : PROVIDERS.find((p) => env[KEY_VARS[p]]);
  if (!provider) return null;
  const key = env.LLM_API_KEY || env[KEY_VARS[provider]];
  if (!key) return null;
  return { provider, key, model: env.LLM_MODEL || PROVIDER_INFO[provider].defaultModel };
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
  serverKey: serverKey(),
  /** Answers per visitor per hour when the server's own key is used (the hosted demo). */
  demoAnswersPerHour: number('DEMO_ANSWERS_PER_HOUR', 30),
  /** Fault injection for demos and tests: on in development, off in production unless ALLOW_FAULTS=true. */
  allowFaults: env.ALLOW_FAULTS ? env.ALLOW_FAULTS === 'true' : !isProduction,
  maxAgentSteps: number('MAX_AGENT_STEPS', 8),
  version: '1.0.0',
};

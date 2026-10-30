import { z } from 'zod';

export const PROVIDERS = ['google', 'groq', 'anthropic', 'openai'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Defaults are fast models with good tool use; any model id the provider accepts can be entered. */
export const PROVIDER_INFO: Record<ProviderId, { label: string; defaultModel: string; models: string[]; keyUrl: string }> = {
  google: {
    label: 'Google Gemini',
    defaultModel: 'gemini-3.6-flash',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    label: 'Groq',
    defaultModel: 'openai/gpt-oss-120b',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
    keyUrl: 'https://console.groq.com/keys',
  },
  anthropic: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5-mini',
    models: ['gpt-5-mini', 'gpt-5.2', 'gpt-5.1'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
};

/** Headers the client uses to pass its own key. The key is never stored or logged on the server. */
export const KEY_HEADERS = { provider: 'x-llm-provider', key: 'x-llm-key', model: 'x-llm-model' } as const;

export const keyCheckRequest = z.object({
  provider: z.enum(PROVIDERS),
  key: z.string().min(8).max(400),
  model: z.string().max(120).optional(),
});
export type KeyCheckRequest = z.infer<typeof keyCheckRequest>;

export type KeyCheckStatus = 'ok' | 'invalid_key' | 'no_model_access' | 'rate_limited' | 'unreachable' | 'error';
export interface KeyCheckResult {
  status: KeyCheckStatus;
  message: string;
  provider: ProviderId;
  model: string;
  latencyMs?: number;
}

/** Fallback models used when the chosen model is rate-limited or overloaded (server key only). */
export const FALLBACK_MODELS: Partial<Record<ProviderId, string[]>> = {
  google: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
};

export interface Health {
  ok: true;
  /** Whether the server has its own key configured (from server/.env). Never the key itself. */
  serverKey: { provider: ProviderId; model: string } | null;
  faultsEnabled: boolean;
  version: string;
}

/**
 * An anonymous id this browser makes up and keeps, so each visitor sees and deletes only their own
 * chats. It is not a secret account: a chat link still opens for anyone, read-only.
 */
export const CLIENT_HEADER = 'x-breeze-client';
export const clientIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Fault injection for demonstrating resilience; only honored when the server enables it. */
export const FAULTS = ['weather_error', 'weather_slow', 'llm_slow', 'drop_stream'] as const;
export type Fault = (typeof FAULTS)[number];
export const FAULT_HEADER = 'x-simulate-faults';

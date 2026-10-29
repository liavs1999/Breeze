import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, wrapLanguageModel, type LanguageModel } from 'ai';
import { FALLBACK_MODELS, KEY_HEADERS, PROVIDER_INFO, PROVIDERS, type ProviderId } from '@wwa/shared';
import { config } from '../config';
import { currentContext, sleep } from '../context';

export interface ModelChoice {
  provider: ProviderId;
  key: string;
  model: string;
  /** 'user': key from the browser; 'server': the server's own key (rate-limited per visitor). */
  origin: 'user' | 'server';
}

/** The browser's key (request headers) wins; otherwise the server's key; otherwise null. */
export function chooseModel(headers: Headers): ModelChoice | null {
  const provider = headers.get(KEY_HEADERS.provider) as ProviderId | null;
  const key = headers.get(KEY_HEADERS.key);
  if (provider && key && PROVIDERS.includes(provider)) {
    return { provider, key, model: headers.get(KEY_HEADERS.model) || PROVIDER_INFO[provider].defaultModel, origin: 'user' };
  }
  if (config.serverKey) return { ...config.serverKey, origin: 'server' };
  return null;
}

export function baseModel(provider: ProviderId, key: string, model: string): LanguageModel {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: key })(model);
    case 'groq':
      return createGroq({ apiKey: key })(model);
    case 'anthropic':
      return createAnthropic({ apiKey: key })(model);
    case 'openai':
      return createOpenAI({ apiKey: key })(model);
  }
}

/** Errors worth trying another model for: rate limits and overloaded or failing servers. */
export function isRetryable(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    return s === 429 || s === 408 || s >= 500;
  }
  return false;
}

/**
 * The model for one answer. Wraps the chosen model so that when a call fails with a rate limit or an
 * overloaded server, the next fallback model takes over (same provider and key). `onModel` reports
 * which model actually answered. The llm_slow fault adds a delay before each call.
 */
export function modelFor(choice: ModelChoice, onModel: (modelId: string) => void): LanguageModel {
  const candidates = [choice.model, ...(FALLBACK_MODELS[choice.provider] ?? []).filter((m) => m !== choice.model)];
  const models = candidates.map((m) => baseModel(choice.provider, choice.key, m) as Exclude<LanguageModel, string>);
  return wrapLanguageModel({
    model: models[0] as any,
    middleware: {
      specificationVersion: 'v4',
      wrapStream: async ({ doStream, params }) => {
        if (currentContext().faults.has('llm_slow')) await sleep(3000, params.abortSignal);
        let lastError: unknown;
        for (let i = 0; i < models.length; i++) {
          try {
            const result = i === 0 ? await doStream() : await (models[i] as any).doStream(params);
            onModel(candidates[i]);
            return result;
          } catch (error) {
            lastError = error;
            if (!isRetryable(error) || params.abortSignal?.aborted) throw error;
          }
        }
        throw lastError;
      },
    },
  });
}

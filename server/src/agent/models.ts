import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, RetryError, wrapLanguageModel, type LanguageModel } from 'ai';
import { FALLBACK_MODELS, KEY_HEADERS, PROVIDER_INFO, PROVIDERS, type ProviderId } from '@wwa/shared';
import { config } from '../config';
import { currentContext, sleep } from '../context';
import { log } from '../log';
import { scriptedModel } from './scripted';

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

const slowFault = {
  specificationVersion: 'v4' as const,
  wrapStream: async ({ doStream, params }: any) => {
    if (currentContext().faults.has('llm_slow')) await sleep(3000, params.abortSignal);
    return doStream();
  },
};

/** Errors worth trying another model for: rate limits and overloaded or failing servers. */
export function isRetryable(error: unknown): boolean {
  if (RetryError.isInstance(error)) error = error.lastError;
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    return s === 429 || s === 408 || s >= 500;
  }
  return false;
}

/**
 * Models that reported a rate limit or a spent quota are skipped until the provider says to retry
 * (a free tier's daily quota can be spent for hours), so later answers do not waste calls on them.
 */
const blockedUntil = new Map<string, number>();
const blockKey = (choice: ModelChoice, model: string) => `${choice.provider}:${model}:${choice.key.slice(-6)}`;

function retryDelayMs(error: unknown): number {
  if (RetryError.isInstance(error)) error = error.lastError;
  const body = APICallError.isInstance(error) ? `${error.responseBody ?? ''} ${error.message}` : '';
  const seconds = /"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"/.exec(body)?.[1] ?? /retry in (\d+(?:\.\d+)?)s/i.exec(body)?.[1];
  const header = APICallError.isInstance(error) ? Number(error.responseHeaders?.['retry-after']) : NaN;
  const ms = seconds ? Number(seconds) * 1000 : Number.isFinite(header) ? header * 1000 : 60_000;
  return Math.min(ms, 24 * 3600_000);
}

/**
 * The model for one answer. Wraps the chosen model so that when a call fails with a rate limit or an
 * overloaded server, the next fallback model takes over (same provider and key). `onModel` reports
 * which model actually answered. The llm_slow fault adds a delay before each call.
 */
export function modelFor(choice: ModelChoice, onModel: (modelId: string) => void): LanguageModel {
  if (choice.model === 'scripted' && choice.origin === 'server' && !config.isProduction) {
    return wrapLanguageModel({ model: scriptedModel(), middleware: slowFault });
  }
  const all = [choice.model, ...(FALLBACK_MODELS[choice.provider] ?? []).filter((m) => m !== choice.model)];
  const models = all.map((m) => baseModel(choice.provider, choice.key, m) as Exclude<LanguageModel, string>);
  // Checked before every call, so a model that ran out during this answer is skipped for its later steps too.
  const usable = () => {
    const now = Date.now();
    const open = all.map((_, i) => i).filter((i) => (blockedUntil.get(blockKey(choice, all[i])) ?? 0) <= now);
    return open.length ? open : all.map((_, i) => i);
  };
  return wrapLanguageModel({
    model: models[0] as any,
    modelId: all[0],
    middleware: {
      specificationVersion: 'v4',
      wrapStream: async ({ doStream, params }) => {
        if (currentContext().faults.has('llm_slow')) await sleep(3000, params.abortSignal);
        const order = usable();
        const candidates = order.map((i) => all[i]);
        let lastError: unknown;
        for (let k = 0; k < order.length; k++) {
          const i = order[k];
          try {
            const result = i === 0 ? await doStream() : await (models[i] as any).doStream(params);
            onModel(all[i]);
            return result;
          } catch (error) {
            lastError = error;
            if (!isRetryable(error) || params.abortSignal?.aborted) throw error;
            const delay = retryDelayMs(error);
            blockedUntil.set(blockKey(choice, all[i]), Date.now() + delay);
            log('model.fallback', {
              from: all[i],
              to: candidates[k + 1] ?? null,
              status: APICallError.isInstance(error) ? error.statusCode : undefined,
              skipForS: Math.round(delay / 1000),
            });
          }
        }
        throw lastError;
      },
    },
  });
}

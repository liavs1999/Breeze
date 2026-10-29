import { APICallError, generateText, LoadAPIKeyError } from 'ai';
import { PROVIDER_INFO, type KeyCheckRequest, type KeyCheckResult } from '@wwa/shared';
import { baseModel } from './models';

/** One tiny request to the provider, reported in plain words. The key is not stored or logged. */
export async function checkKey({ provider, key, model }: KeyCheckRequest): Promise<KeyCheckResult> {
  const modelId = model?.trim() || PROVIDER_INFO[provider].defaultModel;
  const base = { provider, model: modelId };
  const started = Date.now();
  try {
    await generateText({
      model: baseModel(provider, key.trim(), modelId),
      prompt: 'Reply with the single word OK.',
      maxOutputTokens: 32,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(20_000),
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
    });
    const latencyMs = Date.now() - started;
    return { ...base, status: 'ok', message: `Key works with ${modelId} (answered in ${(latencyMs / 1000).toFixed(1)} s).`, latencyMs };
  } catch (error) {
    return { ...base, ...describeLlmError(error, modelId) };
  }
}

export function describeLlmError(error: unknown, modelId: string): Pick<KeyCheckResult, 'status' | 'message'> {
  if (LoadAPIKeyError.isInstance(error)) return { status: 'invalid_key', message: 'No API key was provided.' };
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    const text = `${error.message} ${error.responseBody ?? ''}`.toLowerCase();
    if (s === 401 || s === 403 || text.includes('api key not valid') || text.includes('invalid api key') || text.includes('api_key_invalid')) {
      return { status: 'invalid_key', message: 'The provider rejected this key. Check that it is complete and active.' };
    }
    if (s === 404 || text.includes('not found') || text.includes('does not exist') || text.includes('no longer available')) {
      return { status: 'no_model_access', message: `This key cannot use ${modelId}. Pick another model.` };
    }
    if (s === 429) {
      const quota = text.includes('quota') || text.includes('billing') || text.includes('insufficient');
      return {
        status: 'rate_limited',
        message: quota ? 'The key works, but its quota is used up. Wait for it to reset or use another key.' : 'The key works, but it is rate-limited right now. Try again in a minute.',
      };
    }
    if (s >= 500) return { status: 'error', message: 'The provider had an error. Try again in a moment.' };
    return { status: 'error', message: `The provider refused the request (${s}).` };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { status: 'unreachable', message: 'The provider did not answer within 20 seconds.' };
  }
  return { status: 'unreachable', message: 'Could not reach the provider. Check the connection.' };
}

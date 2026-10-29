import type { LanguageModelV4, LanguageModelV4Prompt, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { sleep } from '../context';

/**
 * A deterministic stand-in for the LLM, used by the end-to-end tests (LLM_PROVIDER=scripted, never in
 * production). It drives the real tools and chart rules: forecast (or current conditions for "now"
 * questions) → show_chart → an answer streamed slowly enough for a test to reload mid-answer.
 */
export function scriptedModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'scripted',
    modelId: 'scripted',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('The scripted model only streams.');
    },
    async doStream({ prompt, abortSignal }) {
      const plan = nextStep(prompt);
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        async start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'response-metadata', modelId: 'scripted' });
          if (plan.type === 'tool') {
            c.enqueue({ type: 'tool-call', toolCallId: `call-${Date.now()}`, toolName: plan.tool, input: JSON.stringify(plan.input) });
            c.enqueue({ type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: usage() });
          } else {
            c.enqueue({ type: 'text-start', id: 't1' });
            for (const word of plan.text.split(' ')) {
              if (abortSignal?.aborted) break;
              await sleep(90).catch(() => {});
              c.enqueue({ type: 'text-delta', id: 't1', delta: `${word} ` });
            }
            c.enqueue({ type: 'text-end', id: 't1' });
            c.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: usage() });
          }
          c.close();
        },
      });
      return { stream };
    },
  };
}

type Plan = { type: 'tool'; tool: string; input: Record<string, unknown> } | { type: 'text'; text: string };

function nextStep(prompt: LanguageModelV4Prompt): Plan {
  const lastUser = prompt.map((m) => m.role).lastIndexOf('user');
  const userText = ((prompt[lastUser]?.content ?? []) as any[]).filter((p) => p.type === 'text').map((p) => p.text).join(' ');
  const results = prompt.slice(lastUser + 1).flatMap((m) => (m.role === 'tool' ? (m.content as any[]) : []));
  const last = results[results.length - 1];
  const place = /\bin ([A-Z][\p{L}\s.-]+?)(?:\?|$|,| this| over| for| right| now| next| today| tomorrow)/u.exec(userText)?.[1]?.trim() ?? 'Tokyo';

  if (!last) {
    if (/\bnow\b/i.test(userText)) return { type: 'tool', tool: 'get_current', input: { place } };
    if (/hour by hour/i.test(userText)) {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      return { type: 'tool', tool: 'get_forecast', input: { place, granularity: 'hourly', date: tomorrow } };
    }
    return { type: 'tool', tool: 'get_forecast', input: { place, granularity: 'daily', days: 7 } };
  }
  const output = last.output?.value ?? {};
  if (last.toolName === 'get_forecast' && output.dataset_id) {
    const kind = output.summary?.hours ? 'hourly' : 'temperature_range';
    return { type: 'tool', tool: 'show_chart', input: { kind, dataset_ids: [output.dataset_id] } };
  }
  if (last.output?.type?.startsWith('error')) {
    return { type: 'text', text: 'The weather service is not responding right now, so I cannot get that forecast. Please try again in a minute.' };
  }
  const where = output.resolved_to ?? place;
  return {
    type: 'text',
    text: `Here is the outlook for ${where}. The chart shows the daily lows and highs for the coming week. This is a scripted answer used by the end-to-end tests; it streams word by word so the tests can reload the page in the middle and check that it finishes exactly once.`,
  };
}

function usage() {
  return {
    inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 50, text: 50, reasoning: 0 },
  };
}

import {
  APICallError,
  RetryError,
  convertToModelMessages,
  createIdGenerator,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import type { Fault, UnitSystem } from '@wwa/shared';
import { config } from '../config';
import { runWithContext, type RunContext } from '../context';
import { saveChat } from '../db';
import { log } from '../log';
import { startRun, type Run } from '../streams';
import { instructions } from './instructions';
import { describeLlmError } from './keycheck';
import { modelFor, type ModelChoice } from './models';
import { ToolError, tools } from './tools';

/** Shown under each answer: which model answered, how long it took, and the tokens used. */
export interface AnswerMetadata {
  createdAt?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  staleData?: boolean;
  /** True when a fallback model answered because the chosen one was rate-limited. */
  fallback?: boolean;
}

export type ChatMessage = UIMessage<AnswerMetadata>;

/** Only the latest turns are sent to the model; older context rarely matters for weather. */
const HISTORY_LIMIT = 24;
const newMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

export interface StartAnswer {
  chatId: string;
  messages: ChatMessage[];
  choice: ModelChoice;
  units: UnitSystem;
  userTimezone?: string;
  faults: Set<Fault>;
}

/**
 * Starts one answer: the tool loop runs on the server, its UI message stream is buffered in a Run
 * (see streams.ts), and the full conversation is saved when the answer ends, completed or stopped.
 */
export async function startAnswer({ chatId, messages, choice, units, userTimezone, faults }: StartAnswer): Promise<Run> {
  const validated = await validateUIMessages<ChatMessage>({ messages, tools: tools as any });
  const ctx: RunContext = { units, faults, usedStaleData: false };
  const abort = new AbortController();
  const startedAt = Date.now();
  let answeredBy = choice.model;

  return runWithContext(ctx, async () => {
    const modelMessages = await convertToModelMessages(validated.slice(-HISTORY_LIMIT), { tools });
    const result = streamText({
      model: modelFor(choice, (m) => (answeredBy = m)),
      instructions: instructions({ units, userTimezone }),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(config.maxAgentSteps),
      abortSignal: abort.signal,
      maxRetries: 1,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
      experimental_transform: smoothStream({ delayInMs: 8, chunking: 'word' }),
      prepareStep: ({ steps }) => {
        const rule = chartRule(steps, instructions({ units, userTimezone }), wantsTextOnly(messages));
        if (rule) log('agent.chart_rule', { chat: chatId, step: steps.length });
        return rule;
      },
      onStepEnd: (step) =>
        log('agent.step', {
          chat: chatId,
          step: step.stepNumber,
          model: answeredBy,
          tools: step.toolCalls.map((c) => c.toolName),
          toolErrors: step.content.filter((c) => c.type === 'tool-error').length,
          finish: step.finishReason,
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
        }),
      onError: ({ error }) => log('agent.error', { chat: chatId, error: errorSummary(error) }),
    });

    const ui = result.toUIMessageStream<ChatMessage>({
      originalMessages: validated,
      generateMessageId: newMessageId,
      sendReasoning: false,
      messageMetadata: ({ part }) => {
        if (part.type === 'start') return { createdAt: new Date().toISOString(), provider: choice.provider };
        if (part.type === 'finish') {
          return {
            model: answeredBy,
            durationMs: Date.now() - startedAt,
            inputTokens: part.totalUsage.inputTokens,
            outputTokens: part.totalUsage.outputTokens,
            staleData: ctx.usedStaleData || undefined,
            fallback: answeredBy !== choice.model || undefined,
          };
        }
        return undefined;
      },
      onError: (error) => clientError(error, answeredBy),
      onEnd: ({ messages: final, isAborted }) => {
        saveChat(chatId, final);
        log('agent.end', { chat: chatId, aborted: isAborted, ms: Date.now() - startedAt, model: answeredBy });
      },
    });

    return startRun(chatId, abort, ui.pipeThrough(new JsonToSseTransformStream()));
  });
}

const DATA_TOOLS = new Set(['get_forecast', 'get_history', 'get_air_quality']);

/** "Text only", "no chart", "without a graph", "just tell me": the user does not want a chart. */
const TEXT_ONLY = /\b(text only|only text|in words|no (charts?|graphs?|visuals?)|without (a |any )?(charts?|graphs?)|just (tell|say|write))\b/i;

export function wantsTextOnly(messages: ChatMessage[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return TEXT_ONLY.test(last?.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ') ?? '');
}

type StepInfo = { toolCalls: { toolName: string }[]; toolResults: { toolName: string; output: unknown }[] };

/**
 * The chart skill's enforcement. When this answer fetched data that qualifies for a chart (4+ days,
 * 6+ hours, or 2+ days of air quality) and no chart was drawn yet, the next step must call show_chart:
 * the agent still picks the kind and the server still checks it, but it cannot skip the chart. A
 * text-only request is never forced, and once show_chart was called (even if rejected) the agent is
 * free again, so a rejected chart ends in a text answer instead of a loop.
 */
export function chartRule(steps: StepInfo[], base: string, textOnly: boolean) {
  if (textOnly || steps.some((s) => s.toolCalls.some((c) => c.toolName === 'show_chart'))) return undefined;
  const qualifying = steps
    .flatMap((s) => s.toolResults)
    .filter((r) => DATA_TOOLS.has(r.toolName))
    .map((r) => ({ tool: r.toolName, ...(r.output as { dataset_id?: string; summary?: { days?: number; hours?: number }; days?: unknown[] }) }))
    .filter(
      (o) =>
        o.dataset_id &&
        ((o.summary?.days ?? 0) >= 4 || (o.summary?.hours ?? 0) >= 6 || (o.tool === 'get_air_quality' && (o.days?.length ?? 0) >= 2)),
    );
  if (!qualifying.length) return undefined;
  const ids = qualifying.map((o) => o.dataset_id).join(', ');
  return {
    instructions: `${base}\n\nChart rule: the data you fetched (${ids}) is a pattern over time or a comparison, so this answer comes with a chart. Call show_chart now with the kind that fits (compare for several places, anomaly for data compared with normal), then write the answer.`,
    toolChoice: { type: 'tool' as const, toolName: 'show_chart' as const },
  };
}

/**
 * Error text for the client, as "code|message": tool errors pass through (the model sees them too),
 * provider errors become a plain explanation, and the code lets the UI react (e.g. open the key panel).
 */
function clientError(error: unknown, modelId: string): string {
  if (error instanceof ToolError) return error.message;
  // After its retries the SDK wraps the provider error; report the underlying one.
  if (RetryError.isInstance(error)) error = error.lastError;
  if (APICallError.isInstance(error)) {
    const { status, message } = describeLlmError(error, modelId);
    return `${status}|${message}`;
  }
  log('agent.unexpected', { error: errorSummary(error) });
  return 'error|Something went wrong while answering. Try again.';
}

function errorSummary(error: unknown) {
  if (RetryError.isInstance(error)) error = error.lastError;
  if (APICallError.isInstance(error)) return { status: error.statusCode, message: error.message.slice(0, 300) };
  return error instanceof Error ? { name: error.name, message: error.message.slice(0, 300) } : String(error);
}

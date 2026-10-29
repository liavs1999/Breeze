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
      prepareStep: ({ steps }) => chartReminder(steps, instructions({ units, userTimezone })),
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

/**
 * The chart skill's reminder: when the fetched data qualifies for a chart (4+ days, 6+ hours, or
 * several places) and no chart was drawn yet, the next step's instructions restate the rule. The
 * agent still decides (text-only requests stay text-only); this keeps smaller models consistent.
 */
function chartReminder(steps: { toolCalls: { toolName: string }[]; toolResults: { toolName: string; output: unknown }[] }[], base: string) {
  if (steps.some((s) => s.toolCalls.some((c) => c.toolName === 'show_chart'))) return undefined;
  const qualifying = steps
    .flatMap((s) => s.toolResults)
    .filter((r) => DATA_TOOLS.has(r.toolName))
    .map((r) => r.output as { dataset_id?: string; summary?: { days?: number; hours?: number }; days?: unknown[] })
    .filter((o) => o?.dataset_id && ((o.summary?.days ?? 0) >= 4 || (o.summary?.hours ?? 0) >= 6 || (o.days?.length ?? 0) >= 2));
  if (!qualifying.length) return undefined;
  const ids = qualifying.map((o) => o.dataset_id).join(', ');
  return {
    instructions: `${base}\n\nReminder (chart rule): the data you fetched (${ids}) qualifies for a chart. Unless the user asked for text only, call show_chart with the fitting kind before you write the answer.`,
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

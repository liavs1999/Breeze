/**
 * Runs the evaluation set against the real agent (same code path as the app: tools, chart rules,
 * stream), and checks for each case: the chart decision and kind, the tools used, required mentions,
 * and grounding (every number in the answer appears in a tool result).
 *
 *   npm run evals                                 all cases, with the first key in server/.env
 *   npm run evals -- compare rain                 only cases whose id contains "compare" or "rain"
 *   npm run evals -- --provider anthropic --model claude-haiku-4-5-20251001
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'breeze-evals-')), 'evals.db');

const { config, SERVER_ROOT } = await import('../config');
const { startAnswer } = await import('../agent/run');
const { CASES } = await import('./cases');
const { getChat } = await import('../db');

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const wantProvider = option('provider');
const wantModel = option('model');
const key = config.serverKeys.find((k) => !wantProvider || k.provider === wantProvider);
if (!key) {
  console.error(`No ${wantProvider ?? 'LLM'} key in server/.env (see .env.example).`);
  process.exit(1);
}
const choice = { ...key, model: wantModel ?? key.model, origin: 'server' as const };

interface Observed {
  tools: string[];
  toolErrors: string[];
  charts: string[];
  text: string;
  toolText: string;
  error?: string;
  ms: number;
}

async function runTurn(chatId: string, text: string, imperial: boolean, history: any[]): Promise<{ observed: Observed; messages: any[] }> {
  const started = Date.now();
  const messages = [...history, { id: `u${history.length}`, role: 'user', parts: [{ type: 'text', text }] }];
  const run = await startAnswer({
    chatId,
    messages,
    choice,
    units: imperial ? 'imperial' : 'metric',
    faults: new Set(),
  });
  while (!run.done) await new Promise((r) => setTimeout(r, 100));

  const observed: Observed = { tools: [], toolErrors: [], charts: [], text: '', toolText: '', ms: Date.now() - started };
  const names = new Map<string, string>();
  for (const chunk of run.chunks) {
    if (!chunk.startsWith('data: {')) continue;
    const e = JSON.parse(chunk.slice(6));
    if (e.type === 'tool-input-available') {
      observed.tools.push(e.toolName);
      names.set(e.toolCallId, e.toolName);
    } else if (e.type === 'tool-output-available') {
      if (names.get(e.toolCallId) === 'show_chart') observed.charts.push(e.output.kind);
      observed.toolText += ` ${JSON.stringify(e.output)}`;
    } else if (e.type === 'tool-output-error') observed.toolErrors.push(`${names.get(e.toolCallId)}: ${e.errorText}`);
    else if (e.type === 'text-delta') observed.text += e.delta;
    else if (e.type === 'error') observed.error = e.errorText;
  }
  // Conversion of the tool results into the user's units happens in toModelOutput; include the
  // converted forms so a °F answer can be grounded too.
  observed.toolText += imperial ? ` ${fahrenheitForms(observed.toolText)}` : '';
  return { observed, messages: getChat(chatId)?.messages ?? messages };
}

/** Numbers in the answer that no tool result supports (dates, times, years and small counts excluded). */
function ungrounded(text: string, toolText: string): string[] {
  const toolNumbers = [...toolText.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const cleaned = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\b/g, ' ')
    .replace(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*/gi, ' ')
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}\b/gi, ' ');
  const out: string[] = [];
  for (const m of cleaned.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (Number.isInteger(n) && Math.abs(n) <= 10 && !/[.°%]/.test(cleaned.slice(m.index! + m[0].length, m.index! + m[0].length + 2))) continue;
    const ok = toolNumbers.some((t) => Math.abs(t - n) <= 0.5 || Math.abs(Math.abs(t) - Math.abs(n)) <= 0.5);
    if (!ok) out.push(m[0]);
  }
  return [...new Set(out)];
}

function fahrenheitForms(toolText: string): string {
  return [...toolText.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => (Number(m[0]) * 1.8 + 32).toFixed(0)).join(' ');
}

const filters = args; // what is left after the options
const cases = CASES.filter((c) => !filters.length || filters.some((f) => c.id.includes(f)));
const results: any[] = [];
console.log(`Running ${cases.length} cases with ${choice.provider}/${choice.model}\n`);

/** Free tiers allow only a few requests per minute: pause between cases, and retry a rate-limited case once. */
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 4000);
async function runCase(c: (typeof cases)[number]): Promise<Observed> {
  const chatId = `eval-${c.id}-${Date.now().toString(36)}`;
  let history: any[] = [];
  let last: Observed | undefined;
  for (const turn of c.turns) {
    const { observed, messages } = await runTurn(chatId, turn, Boolean(c.imperial), history);
    history = messages;
    last = observed;
  }
  return last!;
}

for (const c of cases) {
  let last = await runCase(c);
  if (last.error?.startsWith('rate_limited')) {
    console.log(`      … rate-limited, waiting 60 s and retrying ${c.id}`);
    await new Promise((r) => setTimeout(r, 60_000));
    last = await runCase(c);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
  const o = last!;
  const failures: string[] = [];
  if (o.error) failures.push(`error: ${o.error}`);
  const expected = c.chart == null ? [] : Array.isArray(c.chart) ? c.chart : [c.chart];
  if (c.chart == null && o.charts.length) failures.push(`expected no chart, got ${o.charts.join(', ')}`);
  if (c.chart != null && !o.charts.some((k) => expected.includes(k as any))) {
    failures.push(`expected chart ${expected.join(' or ')}, got ${o.charts.join(', ') || 'none'}`);
  }
  for (const t of c.tools ?? []) if (!o.tools.includes(t)) failures.push(`missing tool ${t}`);
  if (c.minCalls && c.tools && o.tools.filter((t) => t === c.tools![0]).length < c.minCalls) {
    failures.push(`expected ${c.minCalls}× ${c.tools[0]}, got ${o.tools.filter((t) => t === c.tools![0]).length}`);
  }
  for (const t of c.forbidTools ?? []) if (o.tools.includes(t)) failures.push(`should not call ${t}`);
  if (c.mentions && !c.mentions.some((m) => o.text.toLowerCase().includes(m.toLowerCase()))) failures.push(`answer lacks ${c.mentions.join(' / ')}`);
  const loose = ungrounded(o.text, o.toolText);
  // A follow-up may reuse numbers from the previous turn's tools, which this turn did not fetch.
  if (loose.length && c.turns.length === 1) failures.push(`ungrounded numbers: ${loose.join(', ')}`);

  const pass = failures.length === 0;
  results.push({ id: c.id, pass, failures, tools: o.tools, charts: o.charts, toolErrors: o.toolErrors, ms: o.ms, answer: o.text });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${(o.ms / 1000).toFixed(1).padStart(5)} s  tools: ${o.tools.join(', ') || '–'}  chart: ${o.charts.join(', ') || '–'}`);
  for (const f of failures) console.log(`      ✗ ${f}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
const dir = resolve(SERVER_ROOT, 'src/evals/results');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${choice.model.replace(/\//g, '_')}.json`);
writeFileSync(file, JSON.stringify({ model: choice.model, passed, total: results.length, results }, null, 2));
console.log(`Saved ${file}`);
process.exit(passed === results.length ? 0 : 1);

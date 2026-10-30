import { describe, expect, it } from 'vitest';
import { chartRule, wantsTextOnly } from '../src/agent/run';

const step = (toolName: string, output: object) => ({ toolCalls: [{ toolName }], toolResults: [{ toolName, output }] });
const forecast = (days: number) => step('get_forecast', { dataset_id: `ds${days}`, summary: { days }, days: Array(days).fill({}) });
const user = (text: string) => [{ id: 'u', role: 'user' as const, parts: [{ type: 'text' as const, text }] }];

describe('the chart rule', () => {
  it('requires a chart when the fetched data is a pattern over time', () => {
    expect(chartRule([forecast(7)], '', false)?.toolChoice).toEqual({ type: 'tool', toolName: 'show_chart' });
    const month = step('get_history', { dataset_id: 'dsm', summary: { days: 31 }, weeks: [] });
    expect(chartRule([month], '', false)).toBeDefined();
  });

  it('requires one for two or more places compared', () => {
    expect(chartRule([forecast(5), forecast(5)], '', false)?.instructions).toContain('ds5, ds5');
  });

  it('leaves short answers alone: a two-day forecast is not a pattern', () => {
    expect(chartRule([forecast(2)], '', false)).toBeUndefined();
  });

  it('does not force a chart once one was attempted, or when the user asked for text', () => {
    expect(chartRule([forecast(7), step('show_chart', {})], '', false)).toBeUndefined();
    expect(chartRule([forecast(7)], '', true)).toBeUndefined();
  });

  it('recognizes a request for text only', () => {
    expect(wantsTextOnly(user('Compare Paris and Rome this week, text only please') as any)).toBe(true);
    expect(wantsTextOnly(user('Was last month warmer than normal? No chart.') as any)).toBe(true);
    expect(wantsTextOnly(user('Compare Paris and Rome this week') as any)).toBe(false);
  });
});

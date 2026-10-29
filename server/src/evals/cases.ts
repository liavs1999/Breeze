import type { ChartKind } from '@wwa/shared';

/**
 * The chart-trigger and tool-choice evaluation set. Each case is one conversation (usually one turn);
 * the last turn is checked. The same examples are listed in the README under "When does the agent
 * draw a chart?".
 */
export interface EvalCase {
  id: string;
  turns: string[];
  /** The chart kind expected in the last answer, or null for "no chart". An array allows alternatives. */
  chart: ChartKind | ChartKind[] | null;
  /** Tools that must be called in the last turn (each at least once). */
  tools?: string[];
  /** At least this many calls of `tools[0]` (e.g. one forecast per compared place). */
  minCalls?: number;
  /** Tools that must not be called. */
  forbidTools?: string[];
  /** Words or phrases, at least one of which must appear in the answer (case-insensitive). */
  mentions?: string[];
  imperial?: boolean;
}

export const CASES: EvalCase[] = [
  { id: 'week-outlook', turns: ['What will the weather be like in Tokyo this week?'], chart: 'temperature_range', tools: ['get_forecast'] },
  { id: 'rain-next-hours', turns: ['Will it rain in London in the next 24 hours?'], chart: ['hourly', 'precipitation'], tools: ['get_forecast'] },
  { id: 'compare-three', turns: ['Compare Paris, Rome and Madrid over the next 5 days'], chart: 'compare', tools: ['get_forecast'], minCalls: 3 },
  { id: 'warmer-than-normal', turns: ['Was last month warmer than normal in New York?'], chart: 'anomaly', tools: ['get_history'] },
  { id: 'now-temperature', turns: ["What's the temperature in Reykjavík right now?"], chart: null, tools: ['get_current'] },
  { id: 'air-quality', turns: ["How's the air quality in Delhi over the next few days?"], chart: 'air_quality', tools: ['get_air_quality'] },
  { id: 'raining-now', turns: ['Is it raining in Oslo right now?'], chart: null, tools: ['get_current'] },
  { id: 'past-rain', turns: ['How much rain fell in Mumbai in the last two weeks?'], chart: 'precipitation', tools: ['get_history'] },
  { id: 'explicit-chart', turns: ['Give me a chart of the temperature in Cairo for the next 10 days'], chart: 'temperature_range', tools: ['get_forecast'] },
  { id: 'text-only', turns: ["What's the weather in Sydney tomorrow? Just a short text answer, no chart."], chart: null, tools: ['get_forecast'] },
  { id: 'hourly-tomorrow', turns: ['Show me hourly temperatures in Berlin for tomorrow'], chart: 'hourly', tools: ['get_forecast'] },
  { id: 'compare-rain', turns: ['Compare the rain in Seattle and Vancouver over the next 7 days'], chart: 'compare', tools: ['get_forecast'], minCalls: 2 },
  { id: 'single-past-day', turns: ['What was the weather like in Rome on 1990-07-15?'], chart: null, tools: ['get_history'] },
  { id: 'imperial', turns: ["What's the forecast for Chicago this weekend?"], chart: ['temperature_range', 'precipitation', 'hourly'], tools: ['get_forecast'], mentions: ['°F'], imperial: true },
  {
    id: 'follow-up-conversion',
    turns: ['What will the weather be like in Toronto this week?', 'What is the warmest day in Fahrenheit?'],
    chart: null,
    mentions: ['°F'],
  },
  { id: 'ambiguous-place', turns: ['Weather in Springfield right now?'], chart: null, mentions: ['Springfield'] },
  { id: 'off-topic', turns: ['Write me a poem about cats'], chart: null, forbidTools: ['get_current', 'get_forecast', 'get_history', 'get_air_quality'] },
];

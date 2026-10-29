import { tool } from 'ai';
import { z } from 'zod';
import {
  aqiLabel,
  CHART_KINDS,
  COMPARE_METRICS,
  convert,
  describeWeatherCode,
  formatValue,
  type ChartSpec,
  type CurrentWeather,
  type Quantity,
  unitSymbol,
} from '@wwa/shared';
import { currentContext } from '../context';
import { saveDataset } from '../weather/datasets';
import {
  getAirQuality,
  getCurrent,
  getForecast,
  getHistory,
  getNormals,
  placeLabel,
  resolvePlace,
  searchPlaces,
  type Dataset,
} from '../weather/openmeteo';
import { buildChart } from './charts';

/** Errors a tool reports to the model in plain words, so it can correct itself or explain. */
export class ToolError extends Error {}

const place = z.string().min(1).describe('Place name as the user wrote it, optionally with region or country ("Paris, Texas"), or "lat,lon".');

/** Values as the model reads them, in the user's units; temperatures in whole degrees, as the charts show them. */
function fmt(v: number | null | undefined, q: Quantity): string {
  const { units } = currentContext();
  if (q === 'temperature' && v != null) return `${Math.round(convert(v, 'temperature', units))}${unitSymbol('temperature', units)}`;
  return formatValue(v, q, units);
}

async function locate(query: string) {
  try {
    return await resolvePlace(query);
  } catch (error) {
    throw new ToolError(error instanceof Error ? error.message : String(error));
  }
}

function placeInfo(p: Dataset['place'], alternatives: Dataset['place'][] = []) {
  return {
    resolved_to: placeLabel(p),
    timezone: p.timezone,
    ...(alternatives.length ? { other_places_with_this_name: alternatives.map(placeLabel) } : {}),
  };
}

function staleNote() {
  return currentContext().usedStaleData
    ? { data_note: 'The weather service failed, so cached data was used; it may be a few hours old. Tell the user.' }
    : {};
}

export const tools = {
  find_place: tool({
    description:
      'Look up places by name. Use only when a name is ambiguous and the user gave no region or country (e.g. "Springfield"), to ask which one they mean. The other tools resolve names themselves.',
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: async ({ query }) => {
      const places = await searchPlaces(query, 5);
      if (!places.length) throw new ToolError(`No place called "${query}" was found.`);
      return { matches: places.map((p) => ({ name: placeLabel(p), population: p.population ?? null })) };
    },
  }),

  get_current: tool({
    description:
      'Current conditions for one place, plus today\'s low and high. The app shows the result to the user as a "now" card, so do not chart it.',
    inputSchema: z.object({ place }),
    execute: async ({ place: query }): Promise<CurrentWeather & { alternatives: string[]; stale: boolean }> => {
      const { place: p, alternatives } = await locate(query);
      const now = await getCurrent(p);
      return { ...now, alternatives: alternatives.map(placeLabel), stale: currentContext().usedStaleData };
    },
    toModelOutput: ({ output }) => ({
      type: 'json',
      value: {
        ...placeInfo(output.place),
        ...(output.alternatives.length ? { other_places_with_this_name: output.alternatives } : {}),
        local_time: output.observedAt,
        condition: output.condition,
        temperature: fmt(output.temperature, 'temperature'),
        feels_like: fmt(output.feelsLike, 'temperature'),
        humidity: `${output.humidity}%`,
        wind: `${fmt(output.windSpeed, 'wind')}, gusts ${fmt(output.windGusts, 'wind')}`,
        precipitation_now: fmt(output.precipitation, 'precipitation'),
        today: `low ${fmt(output.today.min, 'temperature')}, high ${fmt(output.today.max, 'temperature')}, chance of rain ${output.today.precipitationChance ?? '–'}%`,
        shown_to_user: 'a "now" card with these values',
        ...(output.stale ? staleNote() : {}),
      },
    }),
  }),

  get_forecast: tool({
    description:
      'Forecast for one place: daily for up to 16 days, or hourly for up to 168 hours. Returns a dataset_id you can chart with show_chart.',
    inputSchema: z.object({
      place,
      granularity: z.enum(['daily', 'hourly']).describe('daily for "this week", "next 10 days"; hourly for "today", "tonight", "tomorrow afternoon".'),
      days: z.number().int().min(1).max(16).optional().describe('Daily only. Default 7.'),
      hours: z.number().int().min(6).max(168).optional().describe('Hourly only, counted from now. Default 48.'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('Hourly only: one local day (YYYY-MM-DD) from 00:00 to 23:00, e.g. tomorrow. Use instead of hours for a named day.'),
    }),
    execute: async ({ place: query, granularity, days, hours, date }) => {
      if (date && (Date.parse(date) < Date.now() - 2 * 86_400_000 || Date.parse(date) > Date.now() + 15 * 86_400_000)) {
        throw new ToolError('date must be within the next 15 days; use get_history for the past.');
      }
      const { place: p, alternatives } = await locate(query);
      const ds = saveDataset(await getForecast(p, { granularity, days, hours, date: granularity === 'hourly' ? date : undefined }));
      return { dataset_id: ds.id, ...placeInfo(ds.place, alternatives), ...summarize(ds), ...staleNote() };
    },
  }),

  get_history: tool({
    description:
      'Past weather for one place, any day since 1940. Daily (up to 366 days) or hourly (up to 7 days). Set compare_to_normal to add the 1991–2020 normal for each day (daily, up to 92 days) for questions like "was it unusually warm?". Returns a dataset_id.',
    inputSchema: z.object({
      place,
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, at the latest yesterday'),
      granularity: z.enum(['daily', 'hourly']).optional().describe('Default daily.'),
      compare_to_normal: z.boolean().optional(),
    }),
    execute: async ({ place: query, start_date, end_date, granularity = 'daily', compare_to_normal }) => {
      const days = (Date.parse(end_date) - Date.parse(start_date)) / 86_400_000 + 1;
      if (!(days >= 1)) throw new ToolError('end_date must be on or after start_date.');
      if (start_date < '1940-01-01') throw new ToolError('History starts on 1940-01-01.');
      if (Date.parse(end_date) >= Date.now()) throw new ToolError('end_date must be in the past; use get_forecast for today and later.');
      if (granularity === 'hourly' && days > 7) throw new ToolError('Hourly history covers up to 7 days; use daily for longer ranges.');
      if (days > 366) throw new ToolError('Daily history covers up to 366 days per request.');
      if (compare_to_normal && (granularity !== 'daily' || days > 92)) {
        throw new ToolError('compare_to_normal works for daily data over up to 92 days.');
      }
      const { place: p, alternatives } = await locate(query);
      const data = await getHistory(p, { start: start_date, end: end_date, granularity });
      if (compare_to_normal) data.normals = await getNormals(data.place, data.time);
      const ds = saveDataset(data);
      return { dataset_id: ds.id, ...placeInfo(ds.place, alternatives), ...summarize(ds), ...staleNote() };
    },
  }),

  get_air_quality: tool({
    description: 'Air quality forecast (European AQI and PM2.5) for one place, 1 to 5 days. Returns a dataset_id.',
    inputSchema: z.object({ place, days: z.number().int().min(1).max(5).optional().describe('Default 3.') }),
    execute: async ({ place: query, days = 3 }) => {
      const { place: p, alternatives } = await locate(query);
      const ds = saveDataset(await getAirQuality(p, days));
      return { dataset_id: ds.id, ...placeInfo(ds.place, alternatives), ...summarize(ds), ...staleNote() };
    },
  }),

  show_chart: tool({
    description: `Show a chart built from datasets you already fetched (by dataset_id). Kinds:
- temperature_range: one place, daily lows and highs (adds the normal range if the data has it).
- hourly: one place, hourly temperature with chance of rain (forecast) or rain amount (past).
- precipitation: one place, rain (and snow) per day or hour.
- compare: 2–4 places, one metric over the same days; pass all dataset_ids and a metric.
- anomaly: one place, daily mean temperature above or below the 1991–2020 normal (needs compare_to_normal data).
- air_quality: one place, AQI over the coming days.
The chart is shown to the user above your text.`,
    inputSchema: z.object({
      kind: z.enum(CHART_KINDS),
      dataset_ids: z.array(z.string()).min(1).max(4),
      metric: z.enum(COMPARE_METRICS).optional().describe('compare only. Default temperature_max.'),
    }),
    execute: async ({ kind, dataset_ids, metric }): Promise<ChartSpec> => {
      try {
        return buildChart({ kind, datasetIds: dataset_ids, metric });
      } catch (error) {
        throw new ToolError(error instanceof Error ? error.message : String(error));
      }
    },
    toModelOutput: ({ output }) => ({
      type: 'json',
      value: {
        shown: true,
        kind: output.kind,
        title: output.title,
        next: 'Now write 2–4 sentences: the headline and what stands out. Do not list every value; the chart shows them.',
      },
    }),
  }),
};

export type AgentTools = typeof tools;

// ── Summaries the model reads (in the user's units) ───────────────────────────────────────────

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const weekday = (date: string) => WEEKDAY.format(new Date(`${date}T00:00:00Z`));

function summarize(ds: Dataset) {
  return ds.kind === 'air_quality' ? summarizeAir(ds) : ds.granularity === 'daily' ? summarizeDaily(ds) : summarizeHourly(ds);
}

function summarizeDaily(ds: Dataset) {
  const v = ds.values;
  const rows = ds.time.map((date, i) => ({
    date: `${weekday(date)} ${date}`,
    condition: describeWeatherCode(v.weather_code[i]),
    low: fmt(v.temperature_min[i], 'temperature'),
    high: fmt(v.temperature_max[i], 'temperature'),
    precipitation: fmt(v.precipitation[i], 'precipitation'),
    ...(v.precipitation_probability.length ? { chance_of_rain: `${v.precipitation_probability[i] ?? '–'}%` } : {}),
    ...((v.snowfall_cm[i] ?? 0) > 0 ? { snowfall: `${v.snowfall_cm[i]} cm` } : {}),
    wind_max: fmt(v.wind_max[i], 'wind'),
    ...(ds.normals ? { normal_mean: fmt(ds.normals.mean[i], 'temperature'), mean: fmt(v.temperature_mean[i], 'temperature') } : {}),
  }));
  const totals = {
    days: ds.time.length,
    total_precipitation: fmt(sum(v.precipitation), 'precipitation'),
    wet_days: v.precipitation.filter((p) => (p ?? 0) >= 1).length,
    warmest_day: extreme(ds.time, v.temperature_max, 'max'),
    coldest_night: extreme(ds.time, v.temperature_min, 'min'),
    ...(ds.normals ? anomalyStats(v.temperature_mean, ds.normals.mean) : {}),
  };
  // Long ranges: totals only, plus weekly lines, to keep the model's input small.
  return ds.time.length <= 31 ? { summary: totals, days: rows } : { summary: totals, weeks: weekly(ds) };
}

function summarizeHourly(ds: Dataset) {
  const v = ds.values;
  const step = ds.time.length > 48 ? 6 : 3;
  const rows = ds.time
    .map((time, i) => ({ i, time }))
    .filter(({ i }) => i % step === 0)
    .map(({ time, i }) => ({
      time,
      condition: describeWeatherCode(v.weather_code[i]),
      temperature: fmt(v.temperature[i], 'temperature'),
      precipitation: fmt(v.precipitation[i], 'precipitation'),
      ...(v.precipitation_probability.length ? { chance_of_rain: `${v.precipitation_probability[i] ?? '–'}%` } : {}),
      wind: fmt(v.wind[i], 'wind'),
    }));
  const wetHours = ds.time.filter((_, i) => (v.precipitation[i] ?? 0) >= 0.2);
  return {
    summary: {
      hours: ds.time.length,
      from: ds.time[0],
      to: ds.time[ds.time.length - 1],
      warmest: extreme(ds.time, v.temperature, 'max'),
      coldest: extreme(ds.time, v.temperature, 'min'),
      total_precipitation: fmt(sum(v.precipitation), 'precipitation'),
      hours_with_rain: wetHours.length,
      first_rain: wetHours[0] ?? null,
      ...(v.precipitation_probability.length ? { max_chance_of_rain: `${Math.max(...v.precipitation_probability.map((x) => x ?? 0))}%` } : {}),
    },
    [`every_${step}_hours`]: rows,
  };
}

function summarizeAir(ds: Dataset) {
  const byDay = new Map<string, number[]>();
  ds.time.forEach((t, i) => {
    const aqi = ds.values.aqi[i];
    if (aqi == null) return;
    const date = t.slice(0, 10);
    byDay.set(date, [...(byDay.get(date) ?? []), aqi]);
  });
  return {
    scale: 'European AQI: 0–20 good, 20–40 fair, 40–60 moderate, 60–80 poor, 80–100 very poor, >100 extremely poor',
    days: [...byDay].map(([date, values]) => {
      const peak = Math.max(...values);
      return { date: `${weekday(date)} ${date}`, max_aqi: peak, level: aqiLabel(peak), min_aqi: Math.min(...values) };
    }),
  };
}

function weekly(ds: Dataset) {
  const v = ds.values;
  const weeks: { from: string; to: string; mean_high: string; mean_low: string; precipitation: string }[] = [];
  for (let i = 0; i < ds.time.length; i += 7) {
    const end = Math.min(i + 7, ds.time.length);
    weeks.push({
      from: ds.time[i],
      to: ds.time[end - 1],
      mean_high: fmt(mean(v.temperature_max.slice(i, end)), 'temperature'),
      mean_low: fmt(mean(v.temperature_min.slice(i, end)), 'temperature'),
      precipitation: fmt(sum(v.precipitation.slice(i, end)), 'precipitation'),
    });
  }
  return weeks;
}

function anomalyStats(values: (number | null)[], normals: (number | null)[]) {
  const deltas = values.map((x, i) => (x == null || normals[i] == null ? null : x - normals[i]!)).filter((d): d is number => d != null);
  const avg = mean(deltas);
  const units = currentContext().units;
  // A difference converts without the +32 offset.
  const diff = avg == null ? '–' : `${avg >= 0 ? '+' : ''}${(units === 'imperial' ? avg * 1.8 : avg).toFixed(1)}${units === 'imperial' ? '°F' : '°C'}`;
  return {
    mean_difference_from_normal: diff,
    days_warmer_than_normal: deltas.filter((d) => d > 0.5).length,
    days_colder_than_normal: deltas.filter((d) => d < -0.5).length,
  };
}

function extreme(time: string[], values: (number | null)[], kind: 'max' | 'min') {
  let best = -1;
  values.forEach((x, i) => {
    if (x == null) return;
    if (best < 0 || (kind === 'max' ? x > values[best]! : x < values[best]!)) best = i;
  });
  return best < 0 ? null : `${fmt(values[best], 'temperature')} on ${time[best]}`;
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
const sum = (xs: (number | null)[]) => nums(xs).reduce((a, b) => a + b, 0);
function mean(xs: (number | null)[]) {
  const n = nums(xs);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

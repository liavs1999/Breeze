import type { ChartKind, ChartSpec, CompareMetric } from '@wwa/shared';
import { getDataset } from '../weather/datasets';
import { placeLabel, SOURCE, type Dataset } from '../weather/openmeteo';

/**
 * The enforcing half of the chart skill. The agent decides *whether* to chart and *which kind*;
 * this module checks the request against the rules and builds the chart from the stored data.
 * A rejected request returns a reason the agent can act on (fetch other data, or answer in text).
 */
export class ChartRuleError extends Error {}

export const MIN_POINTS = 4;
export const MAX_PLACES = 4;

export interface ChartRequest {
  kind: ChartKind;
  datasetIds: string[];
  metric?: CompareMetric;
}

export function buildChart(req: ChartRequest): ChartSpec {
  const datasets = req.datasetIds.map((id) => {
    const ds = getDataset(id);
    if (!ds) throw new ChartRuleError(`Dataset ${id} is unknown or expired. Fetch the data again, then chart it.`);
    return ds;
  });
  if (!datasets.length) throw new ChartRuleError('Pass the dataset id(s) returned by the data tools.');

  if (req.kind === 'compare') return compare(datasets, req.metric ?? 'temperature_max');
  if (datasets.length > 1) {
    throw new ChartRuleError(`A ${req.kind} chart shows one place. To show several places, use kind "compare".`);
  }
  const ds = datasets[0];
  switch (req.kind) {
    case 'temperature_range':
      return temperatureRange(ds);
    case 'hourly':
      return hourly(ds);
    case 'precipitation':
      return precipitation(ds);
    case 'anomaly':
      return anomaly(ds);
    case 'air_quality':
      return airQuality(ds);
  }
}

function temperatureRange(ds: Dataset): ChartSpec {
  requireKind(ds, ['forecast', 'history'], 'temperature_range');
  requireGranularity(ds, 'daily', 'temperature_range', 'Use kind "hourly" for hourly data.');
  requirePoints(ds.time.length);
  const { temperature_max: max, temperature_min: min } = ds.values;
  return {
    kind: 'temperature_range',
    title: `${ds.kind === 'forecast' ? `${ds.time.length}-day temperature outlook` : 'Daily temperatures'} · ${ds.place.name}`,
    subtitle: subtitle(ds, ds.normals ? 'gray band: 1991–2020 normal range' : undefined),
    source: source(ds, Boolean(ds.normals)),
    place: chartPlace(ds),
    days: ds.time.map((date, i) => ({
      date,
      min: min[i],
      max: max[i],
      ...(ds.normals ? { normalMin: ds.normals.min[i], normalMax: ds.normals.max[i] } : {}),
    })),
  };
}

function hourly(ds: Dataset): ChartSpec {
  requireKind(ds, ['forecast', 'history'], 'hourly');
  requireGranularity(ds, 'hourly', 'hourly', 'Use kind "temperature_range" or "precipitation" for daily data.');
  requirePoints(ds.time.length, 6);
  const probability = ds.kind === 'forecast' && ds.values.precipitation_probability.some((v) => v != null);
  const rain = probability ? ds.values.precipitation_probability : ds.values.precipitation;
  return {
    kind: 'hourly',
    title: `Next ${ds.time.length} hours · ${ds.place.name}`.replace('Next', ds.kind === 'forecast' ? 'Next' : 'Past'),
    subtitle: subtitle(ds),
    source: source(ds),
    place: chartPlace(ds),
    rainMeasure: probability ? 'probability' : 'amount',
    hours: ds.time.map((time, i) => ({ time, temperature: ds.values.temperature[i], rain: rain[i] })),
  };
}

function precipitation(ds: Dataset): ChartSpec {
  requireKind(ds, ['forecast', 'history'], 'precipitation');
  requirePoints(ds.time.length);
  const { rain, snow } = ds.values;
  const hasSnow = snow.some((v) => (v ?? 0) > 0.05);
  return {
    kind: 'precipitation',
    title: `${hasSnow ? 'Rain and snow' : 'Rain'} · ${ds.place.name}`,
    subtitle: subtitle(ds, hasSnow ? 'snow shown as water equivalent' : undefined),
    source: source(ds),
    place: chartPlace(ds),
    granularity: ds.granularity,
    hasSnow,
    points: ds.time.map((time, i) => ({ time, rain: rain[i], snow: hasSnow ? snow[i] : 0 })),
  };
}

function anomaly(ds: Dataset): ChartSpec {
  requireGranularity(ds, 'daily', 'anomaly');
  if (!ds.normals) {
    throw new ChartRuleError('An anomaly chart needs the normal. Fetch the data with compare_to_normal: true, then chart it.');
  }
  requirePoints(ds.time.length);
  const mean = ds.values.temperature_mean;
  return {
    kind: 'anomaly',
    title: `Warmer or colder than normal · ${ds.place.name}`,
    subtitle: subtitle(ds, 'daily mean vs 1991–2020 normal'),
    source: source(ds, true),
    place: chartPlace(ds),
    days: ds.time.map((date, i) => {
      const value = mean[i];
      const normal = ds.normals!.mean[i];
      return { date, value, normal, delta: value == null || normal == null ? null : round(value - normal) };
    }),
  };
}

function airQuality(ds: Dataset): ChartSpec {
  requireKind(ds, ['air_quality'], 'air_quality');
  const daily = ds.time.length > 72;
  const points = daily
    ? groupByDay(ds.time, [ds.values.aqi, ds.values.pm25]).map(({ date, series }) => ({
        time: date,
        aqi: max(series[0]),
        pm25: max(series[1]),
      }))
    : ds.time.map((time, i) => ({ time, aqi: ds.values.aqi[i], pm25: ds.values.pm25[i] }));
  requirePoints(points.length);
  return {
    kind: 'air_quality',
    title: `Air quality · ${ds.place.name}`,
    subtitle: subtitle(ds, daily ? 'daily maximum, European AQI' : 'European AQI'),
    source: ds.sourceNote,
    place: chartPlace(ds),
    granularity: daily ? 'daily' : 'hourly',
    points,
  };
}

const COMPARE_HOURLY: Record<CompareMetric, string> = {
  temperature_max: 'temperature',
  temperature_min: 'temperature',
  temperature_mean: 'temperature',
  precipitation: 'precipitation',
  wind_max: 'wind',
};

const METRIC_LABEL: Record<CompareMetric, string> = {
  temperature_max: 'Daily high',
  temperature_min: 'Daily low',
  temperature_mean: 'Daily mean temperature',
  precipitation: 'Precipitation',
  wind_max: 'Maximum wind',
};

function compare(datasets: Dataset[], metric: CompareMetric): ChartSpec {
  if (datasets.length < 2) throw new ChartRuleError('A compare chart needs 2 to 4 places. For one place, pick another kind.');
  if (datasets.length > MAX_PLACES) {
    throw new ChartRuleError(`At most ${MAX_PLACES} places fit one chart; pick the ${MAX_PLACES} that matter most.`);
  }
  const granularity = datasets[0].granularity;
  if (datasets.some((d) => d.granularity !== granularity || d.kind === 'air_quality')) {
    throw new ChartRuleError('Compared places need the same kind of data (all daily or all hourly weather).');
  }
  const key = granularity === 'daily' ? metric : COMPARE_HOURLY[metric];
  // Align on the times all places share.
  const shared = datasets[0].time.filter((t) => datasets.every((d) => d.time.includes(t)));
  requirePoints(shared.length);
  const names = datasets.map((d) => d.place.name);
  return {
    kind: 'compare',
    title: `${granularity === 'daily' ? METRIC_LABEL[metric] : METRIC_LABEL[metric].replace('Daily ', '')} · ${names.join(' vs ')}`,
    subtitle: `${range(shared, granularity)} · local time`,
    source: `${SOURCE}`,
    metric,
    granularity,
    times: shared,
    places: datasets.map((d) => ({
      name: d.place.name,
      country: d.place.country,
      values: shared.map((t) => d.values[key][d.time.indexOf(t)] ?? null),
    })),
  };
}

// ── Rule helpers ────────────────────────────────────────────────────────────────────────────────

function requirePoints(n: number, min = MIN_POINTS) {
  if (n < min) {
    throw new ChartRuleError(`Only ${n} data point(s): too few for a chart (minimum ${min}). Answer in text instead.`);
  }
}

function requireKind(ds: Dataset, kinds: Dataset['kind'][], chart: ChartKind) {
  if (!kinds.includes(ds.kind)) {
    throw new ChartRuleError(`A ${chart} chart cannot show ${ds.kind.replace('_', ' ')} data.`);
  }
}

function requireGranularity(ds: Dataset, g: 'daily' | 'hourly', chart: ChartKind, hint = '') {
  if (ds.granularity !== g) throw new ChartRuleError(`A ${chart} chart needs ${g} data. ${hint}`.trim());
}

const chartPlace = (ds: Dataset) => ({ name: placeLabel(ds.place), country: ds.place.country, timezone: ds.place.timezone });
const source = (ds: Dataset, normals = false) => (normals ? `${ds.sourceNote}; normals from ERA5` : ds.sourceNote);
const round = (n: number) => Math.round(n * 10) / 10;

function subtitle(ds: Dataset, extra?: string) {
  return [placeLabel(ds.place), range(ds.time, ds.granularity), 'local time', extra].filter(Boolean).join(' · ');
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function range(times: string[], granularity: 'daily' | 'hourly') {
  const fmt = granularity === 'daily' ? DATE : DATE_TIME;
  const f = (t: string) => fmt.format(new Date(t.length === 10 ? `${t}T00:00:00Z` : `${t}:00Z`));
  return `${f(times[0])} – ${f(times[times.length - 1])}`;
}

function groupByDay(time: string[], series: (number | null)[][]) {
  const days = new Map<string, (number | null)[][]>();
  time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!days.has(date)) days.set(date, series.map(() => []));
    series.forEach((s, k) => days.get(date)![k].push(s[i]));
  });
  return [...days].map(([date, s]) => ({ date, series: s }));
}

function max(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.max(...nums) : null;
}

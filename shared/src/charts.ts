import { z } from 'zod';

/**
 * The chart catalog. The agent picks a kind; the server builds the chart from fetched data, so every
 * number on a chart comes from the weather API, never from the model. Values are always metric
 * (°C, mm, km/h); the client converts for display.
 */
export const CHART_KINDS = ['temperature_range', 'hourly', 'precipitation', 'compare', 'anomaly', 'air_quality'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const COMPARE_METRICS = ['temperature_max', 'temperature_min', 'temperature_mean', 'precipitation', 'wind_max'] as const;
export type CompareMetric = (typeof COMPARE_METRICS)[number];

const place = z.object({
  name: z.string(),
  country: z.string(),
  timezone: z.string(),
});
export type ChartPlace = z.infer<typeof place>;

const base = {
  title: z.string(),
  subtitle: z.string(),
  source: z.string(),
};

const nullableNumber = z.number().nullable();

export const temperatureRangeChart = z.object({
  kind: z.literal('temperature_range'),
  ...base,
  place,
  days: z.array(
    z.object({
      date: z.string(),
      min: nullableNumber,
      max: nullableNumber,
      normalMin: nullableNumber.optional(),
      normalMax: nullableNumber.optional(),
      /** WMO weather code and the chance of rain (forecasts), for the day rows. */
      code: nullableNumber.optional(),
      rainChance: nullableNumber.optional(),
    }),
  ),
});

export const hourlyChart = z.object({
  kind: z.literal('hourly'),
  ...base,
  place,
  /** 'probability' for forecasts (chance of rain, %), 'amount' for the past (mm). */
  rainMeasure: z.enum(['probability', 'amount']),
  hours: z.array(
    z.object({
      time: z.string(),
      temperature: nullableNumber,
      rain: nullableNumber,
      /** WMO weather code and day/night, for the icon row (optional: older saved charts lack them). */
      code: nullableNumber.optional(),
      isDay: z.boolean().nullable().optional(),
    }),
  ),
});

export const precipitationChart = z.object({
  kind: z.literal('precipitation'),
  ...base,
  place,
  granularity: z.enum(['daily', 'hourly']),
  points: z.array(z.object({ time: z.string(), rain: nullableNumber, snow: nullableNumber, code: nullableNumber.optional(), isDay: z.boolean().nullable().optional() })),
  /** Whether any snow fell in the window; when false the chart shows rain only. */
  hasSnow: z.boolean(),
});

export const compareChart = z.object({
  kind: z.literal('compare'),
  ...base,
  metric: z.enum(COMPARE_METRICS),
  granularity: z.enum(['daily', 'hourly']),
  times: z.array(z.string()),
  places: z.array(z.object({ name: z.string(), country: z.string(), values: z.array(nullableNumber) })),
});

export const anomalyChart = z.object({
  kind: z.literal('anomaly'),
  ...base,
  place,
  /** Daily mean temperature compared with the 1991–2020 normal for the same calendar day. */
  days: z.array(z.object({ date: z.string(), value: nullableNumber, normal: nullableNumber, delta: nullableNumber })),
});

export const airQualityChart = z.object({
  kind: z.literal('air_quality'),
  ...base,
  place,
  granularity: z.enum(['daily', 'hourly']),
  points: z.array(z.object({ time: z.string(), aqi: nullableNumber, pm25: nullableNumber })),
});

export const chartSpec = z.discriminatedUnion('kind', [
  temperatureRangeChart,
  hourlyChart,
  precipitationChart,
  compareChart,
  anomalyChart,
  airQualityChart,
]);
export type ChartSpec = z.infer<typeof chartSpec>;
export type ChartOf<K extends ChartKind> = Extract<ChartSpec, { kind: K }>;

/** European AQI bands (EEA). The chart draws them as labeled background bands. */
export const AQI_BANDS = [
  { max: 20, label: 'Good' },
  { max: 40, label: 'Fair' },
  { max: 60, label: 'Moderate' },
  { max: 80, label: 'Poor' },
  { max: 100, label: 'Very poor' },
  { max: Infinity, label: 'Extremely poor' },
] as const;

export function aqiLabel(aqi: number): string {
  return AQI_BANDS.find((b) => aqi <= b.max)!.label;
}

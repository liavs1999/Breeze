import type { ReactNode } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AQI_BANDS, aqiLabel, convert, describeWeatherCode, type ChartOf, type ChartSpec, type CompareMetric, type Quantity, type UnitSystem } from '@wwa/shared';
import {
  activeDot,
  axisProps,
  barProps,
  ChartFrame,
  COLORS,
  cursorProps,
  dayTick,
  display,
  fullTime,
  gridProps,
  hourTick,
  lineProps,
  paddedDomain,
  PLACE_COLORS,
  ticksFor,
  TooltipCard,
  yAxisProps,
  type TooltipRow,
} from './common';
import { HourlyChart } from './HourlyChart';

export interface RenderedChart {
  legend?: { label: string; color: string; shape?: 'line' | 'bar' | 'band' }[];
  body: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  /** One-sentence description for screen readers. */
  label: string;
}

const c = (v: number | null | undefined, q: Quantity, units: UnitSystem) => (v == null ? null : convert(v, q, units));
/** Formats an already-converted temperature. */
const converted = (v: number | null | undefined, units: UnitSystem) =>
  v == null ? '–' : `${Number(v.toFixed(units === 'imperial' ? 0 : 1))}°${units === 'imperial' ? 'F' : 'C'}`;
const margin = { top: 8, right: 12, bottom: 0, left: 0 };

export function renderChart(spec: ChartSpec, units: UnitSystem): RenderedChart {
  switch (spec.kind) {
    case 'temperature_range':
      return temperatureRange(spec, units);
    case 'hourly':
      return hourly(spec, units);
    case 'precipitation':
      return precipitation(spec, units);
    case 'compare':
      return compare(spec, units);
    case 'anomaly':
      return anomaly(spec, units);
    case 'air_quality':
      return airQuality(spec);
  }
}

// ── Temperature range: a band from low to high, the normal range behind it in gray ──────────────

function temperatureRange(spec: ChartOf<'temperature_range'>, units: UnitSystem): RenderedChart {
  const hasNormal = spec.days.some((d) => d.normalMax != null);
  const data = spec.days.map((d) => ({
    t: d.date,
    min: c(d.min, 'temperature', units),
    max: c(d.max, 'temperature', units),
    range: [c(d.min, 'temperature', units), c(d.max, 'temperature', units)],
    normal: hasNormal ? [c(d.normalMin, 'temperature', units), c(d.normalMax, 'temperature', units)] : undefined,
  }));
  const domain = paddedDomain(data.flatMap((d) => [d.min, d.max, ...(d.normal ?? [])]));
  const t = (v: number | null | undefined) => converted(v, units);
  const legend = [
    { label: 'High', color: COLORS.orange },
    { label: 'Low', color: COLORS.blue },
    ...(hasNormal ? [{ label: 'Normal range', color: COLORS.normal, shape: 'band' as const }] : []),
  ];

  return {
    legend,
    label: `${spec.title}. Daily lows and highs for ${spec.days.length} days.`,
    table: {
      columns: ['Day', 'Low', 'High', ...(hasNormal ? ['Normal low', 'Normal high'] : [])],
      rows: spec.days.map((d) => [
        fullTime(d.date),
        display(d.min, 'temperature', units),
        display(d.max, 'temperature', units),
        ...(hasNormal ? [display(d.normalMin, 'temperature', units), display(d.normalMax, 'temperature', units)] : []),
      ]),
    },
    body: (
      <ChartFrame height={260} label={spec.title}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => dayTick(v, data.length)} minTickGap={12} />
            <YAxis {...yAxisProps} domain={domain} ticks={ticksFor(domain)} tickFormatter={(v) => `${v}°`} />
            <Tooltip
              cursor={cursorProps}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const rows: TooltipRow[] = [
                  { label: 'High', color: COLORS.orange, value: t(d.max) },
                  { label: 'Low', color: COLORS.blue, value: t(d.min) },
                ];
                if (d.normal) rows.push({ label: 'Normal', color: COLORS.normal, shape: 'bar', value: `${t(d.normal[0])} – ${t(d.normal[1])}` });
                return <TooltipCard title={fullTime(d.t)} rows={rows} />;
              }}
            />
            {hasNormal && <Area dataKey="normal" stroke="none" fill={COLORS.normal} fillOpacity={1} isAnimationActive={false} />}
            <Area dataKey="range" stroke="none" fill={COLORS.orange} fillOpacity={0.1} isAnimationActive={false} />
            <Line dataKey="max" stroke={COLORS.orange} {...lineProps} dot={{ r: 3, fill: COLORS.orange, strokeWidth: 0 }} activeDot={activeDot} type="monotone" />
            <Line dataKey="min" stroke={COLORS.blue} {...lineProps} dot={{ r: 3, fill: COLORS.blue, strokeWidth: 0 }} activeDot={activeDot} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    ),
  };
}

// ── Hourly: Apple Weather style (see HourlyChart) ────────────────────────────────────────────────

function hourly(spec: ChartOf<'hourly'>, units: UnitSystem): RenderedChart {
  const probability = spec.rainMeasure === 'probability';
  const rainLabel = probability ? 'Chance of rain' : 'Rain';
  return {
    label: `${spec.title}. Hourly temperature and ${rainLabel.toLowerCase()}.`,
    table: {
      columns: ['Time', 'Conditions', 'Temperature', rainLabel],
      rows: spec.hours.map((h) => [
        fullTime(h.time),
        h.code == null ? '–' : describeWeatherCode(h.code),
        display(h.temperature, 'temperature', units),
        probability ? `${h.rain ?? '–'}%` : display(h.rain, 'precipitation', units),
      ]),
    },
    body: <HourlyChart spec={spec} units={units} />,
  };
}

// ── Precipitation: columns; rain and snow (water equivalent) stacked with a surface gap ──────────

function precipitation(spec: ChartOf<'precipitation'>, units: UnitSystem): RenderedChart {
  const data = spec.points.map((p) => ({ t: p.time, rain: c(p.rain, 'precipitation', units), snow: c(p.snow, 'precipitation', units) }));
  const unit = units === 'imperial' ? 'in' : 'mm';
  const v = (x: number | null) => (x == null ? '–' : `${Number(x.toFixed(units === 'imperial' ? 2 : 1))} ${unit}`);
  const daily = spec.granularity === 'daily';

  return {
    legend: spec.hasSnow
      ? [
          { label: 'Rain', color: COLORS.blue, shape: 'bar' },
          { label: 'Snow (water equivalent)', color: COLORS.violet, shape: 'bar' },
        ]
      : undefined,
    label: `${spec.title}. ${daily ? 'Daily' : 'Hourly'} precipitation.`,
    table: {
      columns: [daily ? 'Day' : 'Time', 'Rain', ...(spec.hasSnow ? ['Snow (water eq.)'] : [])],
      rows: spec.points.map((p) => [fullTime(p.time), display(p.rain, 'precipitation', units), ...(spec.hasSnow ? [display(p.snow, 'precipitation', units)] : [])]),
    },
    body: (
      <ChartFrame height={240} label={spec.title}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={margin} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (daily ? dayTick(x, data.length) : hourTick(x))} minTickGap={12} />
            <YAxis {...yAxisProps} domain={[0, 'auto']} allowDecimals />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const rows: TooltipRow[] = [{ label: 'Rain', color: COLORS.blue, shape: 'bar', value: v(d.rain) }];
                if (spec.hasSnow) rows.push({ label: 'Snow', color: COLORS.violet, shape: 'bar', value: v(d.snow) });
                return <TooltipCard title={fullTime(d.t)} rows={rows} />;
              }}
            />
            {spec.hasSnow ? (
              <>
                <Bar dataKey="rain" stackId="p" fill={COLORS.blue} maxBarSize={24} radius={[0, 0, 0, 0]} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
                <Bar dataKey="snow" stackId="p" fill={COLORS.violet} {...barProps} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
              </>
            ) : (
              <Bar dataKey="rain" fill={COLORS.blue} {...barProps} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    ),
  };
}

// ── Compare: up to four places, one metric, fixed colors by place order ─────────────────────────

const METRIC_QUANTITY: Record<CompareMetric, Quantity> = {
  temperature_max: 'temperature',
  temperature_min: 'temperature',
  temperature_mean: 'temperature',
  precipitation: 'precipitation',
  wind_max: 'wind',
};

function compare(spec: ChartOf<'compare'>, units: UnitSystem): RenderedChart {
  const q = METRIC_QUANTITY[spec.metric];
  const keys = spec.places.map((_, i) => `p${i}`);
  const data = spec.times.map((t, i) => Object.fromEntries([['t', t], ...spec.places.map((p, k) => [keys[k], c(p.values[i], q, units)])]));
  const domain = q === 'temperature' ? paddedDomain(data.flatMap((d) => keys.map((k) => d[k] as number | null))) : ([0, 'auto'] as const);
  const daily = spec.granularity === 'daily';
  const asBars = q === 'precipitation';
  const legend = spec.places.map((p, i) => ({ label: p.name, color: PLACE_COLORS[i], shape: asBars ? ('bar' as const) : ('line' as const) }));

  return {
    legend,
    label: `${spec.title}, ${spec.places.length} places.`,
    table: {
      columns: [daily ? 'Day' : 'Time', ...spec.places.map((p) => p.name)],
      rows: spec.times.map((t, i) => [fullTime(t), ...spec.places.map((p) => display(p.values[i], q, units))]),
    },
    body: (
      <ChartFrame height={260} label={spec.title}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={margin} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (daily ? dayTick(x, data.length) : hourTick(x))} minTickGap={12} />
            <YAxis {...yAxisProps} domain={domain as any} ticks={q === 'temperature' ? ticksFor(domain as [number, number]) : undefined} tickFormatter={(v) => (q === 'temperature' ? `${v}°` : `${v}`)} />
            <Tooltip
              cursor={asBars ? { fill: 'var(--surface-muted)' } : cursorProps}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const rows = spec.places.map((p, i) => ({
                  label: p.name,
                  color: PLACE_COLORS[i],
                  shape: asBars ? ('bar' as const) : ('line' as const),
                  value: display(spec.places[i].values[spec.times.indexOf(d.t)], q, units),
                }));
                return <TooltipCard title={fullTime(d.t)} rows={rows} />;
              }}
            />
            {keys.map((k, i) =>
              asBars ? (
                <Bar key={k} dataKey={k} fill={PLACE_COLORS[i]} {...barProps} maxBarSize={14} isAnimationActive={false} />
              ) : (
                <Line key={k} dataKey={k} stroke={PLACE_COLORS[i]} {...lineProps} type="monotone" dot={data.length <= 16 ? { r: 3, fill: PLACE_COLORS[i], strokeWidth: 0 } : false} activeDot={activeDot} />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    ),
  };
}

// ── Anomaly: diverging bars around the normal (warm above, cool below, gray when near normal) ────

function anomaly(spec: ChartOf<'anomaly'>, units: UnitSystem): RenderedChart {
  // A difference converts without the +32 offset.
  const k = units === 'imperial' ? 1.8 : 1;
  const unit = units === 'imperial' ? '°F' : '°C';
  const data = spec.days.map((d) => {
    const delta = d.delta == null ? null : Number((d.delta * k).toFixed(1));
    const near = delta != null && Math.abs(delta) < 0.5 * k;
    return {
      t: d.date,
      delta,
      warm: delta != null && delta >= 0 && !near ? delta : null,
      cool: delta != null && delta < 0 && !near ? delta : null,
      near: near ? delta : null,
      value: d.value,
      normal: d.normal,
    };
  });
  // Symmetric around zero, on even steps: ±2, ±4, ±6…
  const extent = Math.max(1, ...data.map((d) => Math.abs(d.delta ?? 0)));
  const lim = Math.max(2, Math.ceil((extent * 1.1) / 2) * 2);
  const signed = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v}${unit}`);

  return {
    legend: [
      { label: 'Warmer than normal', color: COLORS.warm, shape: 'bar' },
      { label: 'Colder than normal', color: COLORS.cool, shape: 'bar' },
    ],
    label: `${spec.title}. Daily difference from the 1991–2020 normal.`,
    table: {
      columns: ['Day', 'Daily mean', 'Normal', 'Difference'],
      rows: data.map((d) => [fullTime(d.t), display(d.value, 'temperature', units), display(d.normal, 'temperature', units), signed(d.delta)]),
    },
    body: (
      <ChartFrame height={250} label={spec.title}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={margin} stackOffset="sign" barCategoryGap="18%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => dayTick(x, data.length)} minTickGap={12} />
            <YAxis {...yAxisProps} domain={[-lim, lim]} ticks={[-lim, -lim / 2, 0, lim / 2, lim]} tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}°`} />
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <TooltipCard
                    title={fullTime(d.t)}
                    rows={[
                      { label: 'Difference', color: d.delta >= 0 ? COLORS.warm : COLORS.cool, shape: 'bar', value: signed(d.delta) },
                      { label: 'Daily mean', color: 'transparent', value: display(d.value, 'temperature', units) },
                      { label: 'Normal', color: 'transparent', value: display(d.normal, 'temperature', units) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="warm" stackId="a" fill={COLORS.warm} {...barProps} isAnimationActive={false} />
            <Bar dataKey="cool" stackId="a" fill={COLORS.cool} maxBarSize={24} radius={[0, 0, 4, 4]} isAnimationActive={false} />
            <Bar dataKey="near" stackId="a" fill={COLORS.neutral} maxBarSize={24} radius={2} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    ),
  };
}

// ── Air quality: bars against the labeled European AQI bands (status colors with labels) ────────

const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
function aqiColor(aqi: number) {
  if (aqi <= 40) return STATUS.good;
  if (aqi <= 60) return STATUS.warning;
  if (aqi <= 80) return STATUS.serious;
  return STATUS.critical;
}

function airQuality(spec: ChartOf<'air_quality'>): RenderedChart {
  const data = spec.points.map((p) => ({ t: p.time, aqi: p.aqi, pm25: p.pm25, fill: p.aqi == null ? 'transparent' : aqiColor(p.aqi) }));
  const top = Math.max(60, ...data.map((d) => d.aqi ?? 0)) * 1.1;
  const daily = spec.granularity === 'daily';
  const bands = AQI_BANDS.map((b, i) => ({ ...b, min: i === 0 ? 0 : AQI_BANDS[i - 1].max })).filter((b) => b.min < top);

  return {
    label: `${spec.title}. European air quality index.`,
    table: {
      columns: [daily ? 'Day' : 'Time', 'AQI', 'Level', 'PM2.5 (µg/m³)'],
      rows: spec.points.map((p) => [fullTime(p.time), p.aqi ?? '–', p.aqi == null ? '–' : aqiLabel(p.aqi), p.pm25 == null ? '–' : Math.round(p.pm25)]),
    },
    body: (
      <ChartFrame height={240} label={spec.title}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ ...margin, right: 104 }}>
            {bands.map((b) => (
              <ReferenceArea
                key={b.label}
                y1={b.min}
                y2={Math.min(b.max, top)}
                fill="var(--surface-muted)"
                fillOpacity={bands.indexOf(b) % 2 ? 0.9 : 0}
                stroke="none"
                ifOverflow="hidden"
                label={{ value: b.label, position: 'right', fill: 'var(--ink-muted)', fontSize: 11 }}
              />
            ))}
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (daily ? dayTick(x, data.length) : hourTick(x))} minTickGap={12} />
            <YAxis {...yAxisProps} domain={[0, Math.ceil(top)]} ticks={[0, ...bands.map((b) => b.max).filter((m) => m < top)]} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d || d.aqi == null) return null;
                return (
                  <TooltipCard
                    title={fullTime(d.t)}
                    rows={[
                      { label: aqiLabel(d.aqi), color: d.fill, shape: 'bar', value: `AQI ${d.aqi}` },
                      { label: 'PM2.5', color: 'transparent', value: d.pm25 == null ? '–' : `${Math.round(d.pm25)} µg/m³` },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="aqi" {...barProps} maxBarSize={daily ? 24 : 8} isAnimationActive={false} shape={(props: any) => <rect {...roundedTop(props)} fill={props.payload.fill} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    ),
  };
}

/** A bar rect with a rounded top only, for custom-colored bars. */
function roundedTop({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return { x, y, width, height, rx: Math.min(4, width / 2), ry: Math.min(4, width / 2) };
}

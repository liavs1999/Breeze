import { useId } from 'react';
import { Group, Text } from '@mantine/core';
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { convert, describeWeatherCode, type ChartOf, type UnitSystem } from '@wwa/shared';
import { weatherIcon } from '../components/weatherIcons';
import { axisProps, COLORS, cursorProps, fullTime, paddedDomain, ticksFor, TooltipCard, yAxisProps } from './common';
import { gradientStops, temperatureColor } from './temperatureColors';

interface Row {
  t: string;
  celsius: number | null;
  temp: number | null;
  rain: number | null;
  code: number | null;
  isDay: boolean;
}

/**
 * Hour by hour, in the style of Apple Weather: high and low up top, condition icons along the top,
 * a temperature line colored by temperature with a matching fading fill, H and L markers, the current
 * hour marked, hours along the bottom and the scale on the right. Chance of rain sits in a slim
 * panel below (same time axis, its own scale; never a second y-axis on the same plot).
 */
export function HourlyChart({ spec, units }: { spec: ChartOf<'hourly'>; units: UnitSystem }) {
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const probability = spec.rainMeasure === 'probability';
  const rows: Row[] = spec.hours.map((h) => ({
    t: h.time,
    celsius: h.temperature,
    temp: h.temperature == null ? null : convert(h.temperature, 'temperature', units),
    rain: h.rain == null ? null : probability ? h.rain : convert(h.rain, 'precipitation', units),
    code: h.code ?? null,
    isDay: h.isDay ?? true,
  }));
  const valid = rows.filter((r): r is Row & { temp: number; celsius: number } => r.temp != null && r.celsius != null);
  if (!valid.length) return <Text size="sm" c="dimmed">No temperature data for this window.</Text>;

  const hi = valid.reduce((a, b) => (b.temp > a.temp ? b : a));
  const lo = valid.reduce((a, b) => (b.temp < a.temp ? b : a));
  const domain = paddedDomain(valid.map((r) => r.temp));
  const baseCelsius = units === 'imperial' ? (domain[0] - 32) / 1.8 : domain[0];
  const strokeStops = gradientStops(hi.celsius, lo.celsius);
  const fillStops = gradientStops(hi.celsius, baseCelsius);

  const multiDay = new Set(rows.map((r) => r.t.slice(0, 10))).size > 1;
  const hourEvery = rows.length <= 48 ? 6 : 12;
  const iconEvery = rows.length <= 24 ? 2 : rows.length <= 48 ? 3 : 6;
  const hourTicks = rows.filter((r) => hourOf(r.t) % hourEvery === 0).map((r) => r.t);
  const iconTicks = rows.filter((_, i) => i % iconEvery === 0).map((r) => r.t);
  const byTime = new Map(rows.map((r) => [r.t, r]));
  const now = byTime.get(localHour(spec.place.timezone));
  // The rain panel only when rain is a real possibility; otherwise one line says so.
  const maxRain = Math.max(0, ...rows.map((r) => r.rain ?? 0));
  const rainy = probability ? maxRain >= 20 : maxRain >= 0.1;
  const DayIcon = weatherIcon(dominantCode(rows), true);
  const deg = (v: number) => `${Math.round(v)}°`;
  // Room at both ends of the time axis, so the first and last icons and markers are never clipped.
  // Every panel uses the same padding, so their hours line up.
  const edge = { left: 14, right: 14 };
  const label = (r: Row) => `${deg(r.temp!)} at ${fullTime(r.t)}`;

  const tooltip = ({ active, payload }: any) => {
    const r: Row | undefined = active ? payload?.[0]?.payload : undefined;
    if (!r || r.temp == null) return null;
    return (
      <TooltipCard
        title={fullTime(r.t)}
        rows={[
          { label: r.code == null ? 'Temperature' : describeWeatherCode(r.code), color: temperatureColor(r.celsius ?? 0), value: `${r.temp.toFixed(units === 'imperial' ? 0 : 1)}°` },
          ...(r.rain != null ? [{ label: probability ? 'Chance of rain' : 'Rain', color: COLORS.blue, shape: 'bar' as const, value: probability ? `${r.rain}%` : `${r.rain.toFixed(1)} ${units === 'imperial' ? 'in' : 'mm'}` }] : []),
        ]}
      />
    );
  };

  return (
    <div data-chart role="img" aria-label={`${spec.title}. High ${label(hi)}, low ${label(lo)}.`}>
      <Group gap={10} align="center" mb={2} wrap="nowrap">
        <Text fz={34} fw={600} lh={1} style={{ letterSpacing: '-0.02em' }}>
          {deg(hi.temp)}
        </Text>
        <Text fz={34} fw={500} lh={1} c="dimmed" style={{ letterSpacing: '-0.02em' }}>
          {deg(lo.temp)}
        </Text>
        <DayIcon size={30} stroke={1.5} color="var(--ink-secondary)" aria-hidden />
        <Text size="xs" c="dimmed" ml="auto" ta="right">
          High · low
          <br />
          {units === 'imperial' ? 'Fahrenheit (°F)' : 'Celsius (°C)'}
        </Text>
      </Group>

      <div style={{ height: 236 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 4 }} syncId={id}>
            <defs>
              <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="0" y2="1">
                {strokeStops.map((s) => (
                  <stop key={s.offset} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                {fillStops.map((s) => (
                  <stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={0.42 - 0.36 * s.offset} />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical horizontal />
            <XAxis xAxisId="icons" orientation="top" dataKey="t" ticks={iconTicks} interval={0} height={30} padding={edge} axisLine={false} tickLine={false} tick={<IconTick byTime={byTime} />} />
            <XAxis dataKey="t" ticks={hourTicks} interval={0} padding={edge} {...axisProps} tickFormatter={(t: string) => (multiDay && hourOf(t) === 0 ? weekday(t) : String(hourOf(t)))} />
            <YAxis orientation="right" {...yAxisProps} width={40} domain={domain} ticks={ticksFor(domain)} tickFormatter={(v) => `${v}°`} />
            <Tooltip cursor={cursorProps} content={tooltip} />
            <Area
              dataKey="temp"
              type="monotone"
              stroke={`url(#${id}-stroke)`}
              strokeWidth={4}
              strokeLinecap="round"
              fill={`url(#${id}-fill)`}
              fillOpacity={1}
              baseValue={domain[0]}
              dot={false}
              activeDot={{ r: 5, fill: 'var(--surface)', stroke: 'var(--ink-primary)', strokeWidth: 2.5 }}
              isAnimationActive={false}
            />
            {now && <ReferenceLine x={now.t} stroke="var(--ink-muted)" strokeWidth={1} label={{ value: 'Now', position: 'insideTopLeft', fill: 'var(--ink-muted)', fontSize: 11 }} />}
            <ReferenceDot x={hi.t} y={hi.temp} r={6} fill="var(--surface)" stroke="var(--ink-primary)" strokeWidth={3} label={{ value: 'H', position: 'top', offset: 10, fill: 'var(--ink-secondary)', fontSize: 12, fontWeight: 600 }} />
            {lo.t !== hi.t && (
              <ReferenceDot x={lo.t} y={lo.temp} r={6} fill="var(--surface)" stroke="var(--ink-primary)" strokeWidth={3} label={{ value: 'L', position: 'top', offset: 10, fill: 'var(--ink-secondary)', fontSize: 12, fontWeight: 600 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {rainy ? (
        <>
          <Text size="xs" c="dimmed" mt={6}>
            {probability ? 'Chance of rain' : `Rain (${units === 'imperial' ? 'in' : 'mm'})`}
          </Text>
          <div style={{ height: 64 }}>
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 4 }} syncId={id}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="t" hide padding={edge} />
                <YAxis orientation="right" {...yAxisProps} width={40} domain={probability ? [0, 100] : [0, 'auto']} ticks={probability ? [0, 100] : undefined} tickFormatter={(v) => (probability ? `${v}%` : `${v}`)} />
                {/* Linked to the panel above (syncId): it shows the one tooltip for both; this one only highlights. */}
                <Tooltip cursor={{ fill: 'var(--surface-muted)' }} content={() => null} />
                <Bar dataKey="rain" fill={COLORS.blue} maxBarSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <Text size="xs" c="dimmed" mt={6}>
          {probability
            ? maxRain > 0
              ? `Low chance of rain (at most ${maxRain}%).`
              : 'No rain expected.'
            : maxRain > 0
              ? 'Only traces of rain.'
              : 'No rain fell in this window.'}
        </Text>
      )}
    </div>
  );
}

/** A condition icon above every few hours (moon at night). */
function IconTick({ x, y, payload, byTime }: { x?: number; y?: number; payload?: { value: string }; byTime: Map<string, Row> }) {
  const row = payload ? byTime.get(payload.value) : undefined;
  if (x == null || y == null || !row || row.code == null) return null;
  const Icon = weatherIcon(row.code, row.isDay);
  return (
    <g transform={`translate(${x - 9}, ${y - 24})`}>
      <Icon size={18} stroke={1.6} color="var(--ink-secondary)" />
    </g>
  );
}

const hourOf = (t: string) => Number(t.slice(11, 13));
const weekday = (t: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${t.slice(0, 10)}T00:00:00Z`));

/** The current hour at the place, as the chart's local time key ("YYYY-MM-DDTHH:00"). */
function localHour(timeZone: string): string {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  } catch {
    return '';
  }
}

/** The condition that covers most daytime hours (all hours if there is no daytime in the window). */
function dominantCode(rows: Row[]): number {
  const pool = rows.filter((r) => r.code != null && r.isDay);
  const counts = new Map<number, number>();
  for (const r of pool.length ? pool : rows.filter((x) => x.code != null)) counts.set(r.code!, (counts.get(r.code!) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3;
}

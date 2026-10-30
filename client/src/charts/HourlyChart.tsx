import { useId } from 'react';
import { Text } from '@mantine/core';
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { convert, describeWeatherCode, type ChartOf, type UnitSystem } from '@breeze/shared';
import { weatherIcon } from '../components/weatherIcons';
import { axisProps, COLORS, cursorProps, fullTime, paddedDomain, ticksFor, TooltipCard, yAxisProps } from './common';
import { deg, dominantCode, Hero, hourOf, IconTick, localHour, weekdayShort as weekday } from './parts';
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
 * Hour by hour: high and low up top, condition icons along the top,
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
    <div data-chart className="hourly-chart" role="img" aria-label={`${spec.title}. High ${label(hi)}, low ${label(lo)}.`}>
      <Hero
        values={[{ text: deg(hi.temp) }, { text: deg(lo.temp), dim: true }]}
        icon={DayIcon}
        caption={
          <>
            High · low
            <br />
            {units === 'imperial' ? 'Fahrenheit (°F)' : 'Celsius (°C)'}
          </>
        }
      />

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
            <XAxis xAxisId="icons" orientation="top" dataKey="t" ticks={iconTicks} interval={0} height={30} axisLine={false} tickLine={false} tick={<IconTick byTime={byTime} />} />
            <XAxis dataKey="t" ticks={hourTicks} interval={0} {...axisProps} tickFormatter={(t: string) => (multiDay && hourOf(t) === 0 ? weekday(t) : String(hourOf(t)))} />
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
                <XAxis dataKey="t" hide />
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

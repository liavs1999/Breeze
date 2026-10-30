import { useId } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { convert, type ChartOf, type UnitSystem } from '@breeze/shared';
import { axisProps, COLORS, cursorProps, dayTick, fullTime, paddedDomain, ticksFor, TooltipCard, yAxisProps } from './common';
import { deg, Hero } from './parts';
import { gradientStops, temperatureColor } from './temperatureColors';

/**
 * Long periods (and any period compared with normal): one rounded column per day from low to high,
 * colored by temperature, with the 1991–2020 normal range as a gray band behind.
 */
export function RangeColumns({ spec, units }: { spec: ChartOf<'temperature_range'>; units: UnitSystem }) {
  const id = `r${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = (v: number | null | undefined) => (v == null ? null : convert(v, 'temperature', units));
  const hasNormal = spec.days.some((d) => d.normalMax != null);
  const data = spec.days.map((d) => ({
    t: d.date,
    minC: d.min,
    maxC: d.max,
    range: d.min == null || d.max == null ? null : [c(d.min), c(d.max)],
    normal: hasNormal ? [c(d.normalMin), c(d.normalMax)] : undefined,
  }));
  const temps = data.flatMap((d) => [...(d.range ?? []), ...(d.normal ?? [])]) as (number | null)[];
  const domain = paddedDomain(temps);
  const highs = data.filter((d) => d.range).map((d) => d.range![1]!);
  const lows = data.filter((d) => d.range).map((d) => d.range![0]!);

  return (
    <div data-chart role="img" aria-label={`${spec.title}. Daily lows and highs for ${spec.days.length} days.`}>
      <Hero
        values={[{ text: deg(Math.max(...highs)) }, { text: deg(Math.min(...lows)), dim: true }]}
        caption={
          <>
            Warmest · coldest
            {hasNormal && (
              <>
                <br />
                gray band: normal range
              </>
            )}
          </>
        }
      />
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 4 }} barCategoryGap="22%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => dayTick(v, data.length)} minTickGap={16} />
            <YAxis orientation="right" {...yAxisProps} width={40} domain={domain} ticks={ticksFor(domain)} tickFormatter={(v) => `${v}°`} />
            <Tooltip
              cursor={cursorProps}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d?.range) return null;
                const rows = [
                  { label: 'High', color: temperatureColor(d.maxC), value: deg(d.range[1]) },
                  { label: 'Low', color: temperatureColor(d.minC), value: deg(d.range[0]) },
                ];
                if (d.normal?.[0] != null) rows.push({ label: 'Normal', color: COLORS.normal, value: `${deg(d.normal[0])} – ${deg(d.normal[1])}` });
                return <TooltipCard title={fullTime(d.t)} rows={rows} />;
              }}
            />
            {hasNormal && <Area dataKey="normal" stroke="none" fill={COLORS.normal} fillOpacity={1} isAnimationActive={false} />}
            <Bar dataKey="range" maxBarSize={14} isAnimationActive={false} shape={(p: any) => <GradientColumn {...p} id={id} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A fully rounded column whose own gradient runs from its low (bottom) to its high (top). */
function GradientColumn({ x, y, width, height, payload, index, id }: any) {
  if (payload?.minC == null || payload?.maxC == null || !(height > 0)) return null;
  const gid = `${id}-${index}`;
  const r = Math.min(width / 2, 7);
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          {gradientStops(payload.maxC, payload.minC).map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={r} ry={r} fill={`url(#${gid})`} />
    </g>
  );
}

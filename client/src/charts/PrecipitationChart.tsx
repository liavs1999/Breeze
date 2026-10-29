import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconCloudRain, IconCloudSnow, IconSun } from '@tabler/icons-react';
import { convert, type ChartOf, type UnitSystem } from '@wwa/shared';
import { axisProps, COLORS, fullTime, hourTick, dayTick, paddedDomain, ticksFor, TooltipCard, yAxisProps } from './common';
import { Hero, IconTick, type Conditions } from './parts';

/** Rain blue that deepens with intensity (mm per day or hour): one hue, light to dark. */
function rainColor(mm: number, hourly: boolean): string {
  const k = hourly ? mm / 4 : mm / 20; // heavy: 4 mm/h, or 20 mm/day
  if (k < 0.1) return '#9ec5f4';
  if (k < 0.3) return '#6da7ec';
  if (k < 0.6) return '#3987e5';
  return '#1c5cab';
}

/**
 * Rain (and snow, as water equivalent) per day or hour: the total up top, condition icons along the
 * top, columns that get darker as rain gets heavier, scale on the right.
 */
export function PrecipitationChart({ spec, units }: { spec: ChartOf<'precipitation'>; units: UnitSystem }) {
  const hourly = spec.granularity === 'hourly';
  const unit = units === 'imperial' ? 'in' : 'mm';
  const digits = units === 'imperial' ? 2 : 1;
  const data = spec.points.map((p) => ({
    t: p.time,
    rainMm: p.rain ?? 0,
    rain: p.rain == null ? null : convert(p.rain, 'precipitation', units),
    snow: p.snow == null ? null : convert(p.snow, 'precipitation', units),
    code: p.code ?? null,
    isDay: p.isDay ?? true,
  }));
  const total = data.reduce((a, d) => a + (d.rain ?? 0) + (d.snow ?? 0), 0);
  const wet = data.filter((d) => (d.rainMm ?? 0) + (d.snow ?? 0) >= (hourly ? 0.1 : 1)).length;
  const byTime = new Map<string, Conditions>(data.map((d) => [d.t, { code: d.code, isDay: d.isDay }]));
  const hasCodes = data.some((d) => d.code != null);
  const iconEvery = hourly ? (data.length <= 24 ? 2 : data.length <= 48 ? 3 : 6) : data.length <= 16 ? 1 : 7;
  const iconTicks = data.filter((_, i) => i % iconEvery === 0).map((d) => d.t);
  const fmt = (v: number) => `${v.toFixed(digits)} ${unit}`;
  const peak = Math.max(...data.map((d) => (d.rain ?? 0) + (d.snow ?? 0)), hourly ? 1 : 4);
  const domain = paddedDomain([0, peak], true);

  return (
    <div data-chart role="img" aria-label={`${spec.title}. Total ${fmt(total)}.`}>
      <Hero
        values={[{ text: `${total.toFixed(digits)} ${unit}` }]}
        icon={total === 0 ? IconSun : spec.hasSnow ? IconCloudSnow : IconCloudRain}
        caption={
          <>
            Total
            <br />
            {hourly ? `rain in ${wet} of ${data.length} hours` : `${wet} of ${data.length} days wet`}
          </>
        }
      />
      <div style={{ height: 230 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 4 }} barCategoryGap="24%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            {hasCodes && (
              <XAxis xAxisId="icons" orientation="top" dataKey="t" ticks={iconTicks} interval={0} height={30} axisLine={false} tickLine={false} tick={<IconTick byTime={byTime} />} />
            )}
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (hourly ? hourTick(x) : dayTick(x, data.length))} minTickGap={14} />
            <YAxis orientation="right" {...yAxisProps} width={40} domain={domain} ticks={ticksFor(domain)} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const rows = [{ label: 'Rain', color: rainColor(d.rainMm, hourly), shape: 'bar' as const, value: fmt(d.rain ?? 0) }];
                if (spec.hasSnow) rows.push({ label: 'Snow (water)', color: COLORS.violet, shape: 'bar' as const, value: fmt(d.snow ?? 0) });
                return <TooltipCard title={fullTime(d.t)} rows={rows} />;
              }}
            />
            <Bar
              dataKey="rain"
              stackId="p"
              maxBarSize={hourly ? 10 : 22}
              isAnimationActive={false}
              shape={(p: any) => (p.height > 0 ? <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={Math.min(4, p.width / 2)} fill={rainColor(p.payload.rainMm, hourly)} /> : null)}
            />
            {spec.hasSnow && <Bar dataKey="snow" stackId="p" fill={COLORS.violet} maxBarSize={hourly ? 10 : 22} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

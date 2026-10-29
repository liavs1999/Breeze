import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconTemperatureMinus, IconTemperaturePlus } from '@tabler/icons-react';
import { formatValue, type ChartOf, type UnitSystem } from '@wwa/shared';
import { axisProps, dayTick, fullTime, TooltipCard, yAxisProps } from './common';
import { Hero } from './parts';

const WARM = '#ff8a3d';
const COOL = '#4aa3ff';
const NEAR = 'var(--surface-muted)';

/**
 * Compared with normal: the average difference up top ("+0.6° above normal"), then one rounded bar
 * per day above (warm) or below (cool) the 1991–2020 normal; days within half a degree are gray.
 */
export function AnomalyChart({ spec, units }: { spec: ChartOf<'anomaly'>; units: UnitSystem }) {
  const k = units === 'imperial' ? 1.8 : 1; // a difference converts without the +32 offset
  const data = spec.days.map((d) => {
    const delta = d.delta == null ? null : Number((d.delta * k).toFixed(1));
    return { t: d.date, delta, value: d.value, normal: d.normal, fill: delta == null ? NEAR : Math.abs(delta) < 0.5 * k ? NEAR : delta > 0 ? WARM : COOL };
  });
  const deltas = data.map((d) => d.delta).filter((v): v is number => v != null);
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const warmer = deltas.filter((d) => d >= 0.5 * k).length;
  const colder = deltas.filter((d) => d <= -0.5 * k).length;
  const extent = Math.max(1, ...deltas.map(Math.abs));
  const lim = Math.max(2, Math.ceil((extent * 1.1) / 2) * 2);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°`;
  const above = avg >= 0;

  return (
    <div data-chart role="img" aria-label={`${spec.title}. On average ${signed(avg)} ${above ? 'above' : 'below'} normal.`}>
      <Hero
        values={[{ text: signed(avg) }, { text: above ? 'above normal' : 'below normal', dim: true }]}
        icon={above ? IconTemperaturePlus : IconTemperatureMinus}
        caption={
          <>
            vs 1991–2020 average
            <br />
            {warmer} warmer · {colder} colder days
          </>
        }
      />
      <div style={{ height: 230 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 4 }} barCategoryGap="22%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => dayTick(x, data.length)} minTickGap={14} />
            <YAxis orientation="right" {...yAxisProps} width={40} domain={[-lim, lim]} ticks={[-lim, -lim / 2, 0, lim / 2, lim]} tickFormatter={(v) => (v === 0 ? '0°' : signed(v).replace('.0', ''))} />
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d || d.delta == null) return null;
                return (
                  <TooltipCard
                    title={fullTime(d.t)}
                    rows={[
                      { label: 'vs normal', color: d.fill, shape: 'bar', value: signed(d.delta) },
                      { label: 'Daily mean', color: 'transparent', value: formatValue(d.value, 'temperature', units) },
                      { label: 'Normal', color: 'transparent', value: formatValue(d.normal, 'temperature', units) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="delta"
              maxBarSize={14}
              isAnimationActive={false}
              shape={(p: any) => {
                const h = Math.abs(p.height);
                if (!(h > 0)) return null;
                const y = p.height < 0 ? p.y + p.height : p.y;
                return <rect x={p.x} y={y} width={p.width} height={Math.max(h, 3)} rx={Math.min(p.width / 2, 7)} fill={p.payload.fill} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

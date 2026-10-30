import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SimpleGrid, Text } from '@mantine/core';
import { convert, formatValue, type ChartOf, type CompareMetric, type Quantity, type UnitSystem } from '@breeze/shared';
import { activeDot, axisProps, cursorProps, dayTick, fullTime, hourTick, paddedDomain, PLACE_COLORS, ticksFor, TooltipCard, yAxisProps } from './common';

const QUANTITY: Record<CompareMetric, Quantity> = {
  temperature_max: 'temperature',
  temperature_min: 'temperature',
  temperature_mean: 'temperature',
  precipitation: 'precipitation',
  wind_max: 'wind',
};
const HEADLINE: Record<CompareMetric, string> = {
  temperature_max: 'warmest high',
  temperature_min: 'coldest low',
  temperature_mean: 'average',
  precipitation: 'total',
  wind_max: 'strongest wind',
};

/**
 * Two to four places: a tile per place up top (its color, name and headline value: the legend and
 * the summary at once), then smooth lines (bars for precipitation) on one scale, on the right.
 * Colors follow the place's position in the question, never its rank.
 */
export function CompareChart({ spec, units }: { spec: ChartOf<'compare'>; units: UnitSystem }) {
  const q = QUANTITY[spec.metric];
  const keys = spec.places.map((_, i) => `p${i}`);
  const data = spec.times.map((t, i) => Object.fromEntries([['t', t], ...spec.places.map((p, k) => [keys[k], p.values[i] == null ? null : convert(p.values[i]!, q, units)])]));
  const daily = spec.granularity === 'daily';
  const bars = q === 'precipitation';
  const domain: [number, number] = q === 'temperature' ? paddedDomain(data.flatMap((d) => keys.map((k) => d[k] as number | null))) : [0, 0];

  const tempHeadline = (v: number | null) => (v == null ? '–' : `${Math.round(v)}°`);
  const headline = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) return null;
    if (spec.metric === 'precipitation') return nums.reduce((a, b) => a + b, 0);
    if (spec.metric === 'temperature_min') return Math.min(...nums);
    if (spec.metric === 'temperature_mean') return nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.max(...nums);
  };

  return (
    <div data-chart role="img" aria-label={`${spec.title}, ${spec.places.length} places.`}>
      <SimpleGrid cols={{ base: 2, xs: spec.places.length }} spacing={8} mb={10}>
        {spec.places.map((p, i) => (
          <div key={p.name} className="tile">
            <Text size="xs" c="dimmed" truncate="end" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: PLACE_COLORS[i], flexShrink: 0 }} />
              {p.name}
            </Text>
            <Text fz={24} fw={600} lh={1.15} style={{ letterSpacing: '-0.02em' }}>
              {q === 'temperature' ? tempHeadline(headline(p.values)) : formatValue(headline(p.values), q, units)}
            </Text>
            <Text size="xs" c="dimmed">
              {HEADLINE[spec.metric]}
            </Text>
          </div>
        ))}
      </SimpleGrid>
      <div style={{ height: 230 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 4 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (daily ? dayTick(x, data.length) : hourTick(x))} minTickGap={14} />
            <YAxis
              orientation="right"
              {...yAxisProps}
              width={40}
              domain={q === 'temperature' ? domain : [0, 'auto']}
              ticks={q === 'temperature' ? ticksFor(domain) : undefined}
              tickFormatter={(v) => (q === 'temperature' ? `${v}°` : `${v}`)}
            />
            <Tooltip
              cursor={bars ? { fill: 'var(--surface-muted)' } : cursorProps}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const i = spec.times.indexOf(d.t);
                return (
                  <TooltipCard
                    title={fullTime(d.t)}
                    rows={spec.places.map((p, k) => ({ label: p.name, color: PLACE_COLORS[k], shape: bars ? ('bar' as const) : ('line' as const), value: formatValue(p.values[i], q, units) }))}
                  />
                );
              }}
            />
            {keys.map((k, i) =>
              bars ? (
                <Bar key={k} dataKey={k} fill={PLACE_COLORS[i]} maxBarSize={12} radius={[4, 4, 4, 4]} isAnimationActive={false} />
              ) : (
                <Line key={k} dataKey={k} type="monotone" stroke={PLACE_COLORS[i]} strokeWidth={3} strokeLinecap="round" dot={false} activeDot={activeDot} isAnimationActive={false} />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

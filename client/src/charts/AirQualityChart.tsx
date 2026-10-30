import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Group, Text } from '@mantine/core';
import { AQI_BANDS, aqiLabel, type ChartOf } from '@breeze/shared';
import { axisProps, dayTick, fullTime, hourTick, TooltipCard, yAxisProps } from './common';
import { Hero } from './parts';

/** European AQI → color on one continuous scale, from good (green) to extremely poor (purple). */
const AQI_RAMP: [number, [number, number, number]][] = [
  [0, [52, 199, 89]],
  [25, [163, 206, 61]],
  [45, [255, 204, 0]],
  [65, [255, 149, 0]],
  [85, [255, 59, 48]],
  [110, [175, 82, 222]],
];
export function aqiColor(aqi: number): string {
  if (aqi <= AQI_RAMP[0][0]) return rgb(AQI_RAMP[0][1]);
  for (let i = 1; i < AQI_RAMP.length; i++) {
    const [t1, c1] = AQI_RAMP[i];
    if (aqi <= t1) {
      const [t0, c0] = AQI_RAMP[i - 1];
      const k = (aqi - t0) / (t1 - t0);
      return rgb(c0.map((v, j) => Math.round(v + (c1[j] - v) * k)) as [number, number, number]);
    }
  }
  return rgb(AQI_RAMP[AQI_RAMP.length - 1][1]);
}
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;
const SCALE_MAX = 120;
const SCALE = `linear-gradient(90deg, ${AQI_RAMP.map(([t, c]) => `${rgb(c)} ${((t / SCALE_MAX) * 100).toFixed(0)}%`).join(', ')})`;

/**
 * Air quality: the peak and its level up top, the color scale with markers for the lowest and highest
 * values of the window, then the AQI over time with each bar in its level's color (and its label in
 * the tooltip, so color is never the only cue).
 */
export function AirQualityChart({ spec }: { spec: ChartOf<'air_quality'> }) {
  const daily = spec.granularity === 'daily';
  const data = spec.points.map((p) => ({ t: p.time, aqi: p.aqi, pm25: p.pm25 }));
  const values = data.map((d) => d.aqi).filter((v): v is number => v != null);
  const peak = Math.max(...values);
  const low = Math.min(...values);
  const top = Math.max(60, peak) * 1.1;
  const at = (v: number) => `${Math.min(100, (v / SCALE_MAX) * 100)}%`;

  return (
    <div data-chart role="img" aria-label={`${spec.title}. Peak AQI ${peak} (${aqiLabel(peak)}), lowest ${low}.`}>
      <Hero values={[{ text: String(peak) }, { text: aqiLabel(peak), dim: true }]} caption={<>Peak · European AQI<br />lowest {low} ({aqiLabel(low)})</>} />
      <div style={{ position: 'relative', margin: '10px 0 4px' }} aria-hidden>
        <div style={{ height: 6, borderRadius: 3, background: SCALE }} />
        <span className="scale-dot" style={{ left: at(low), width: 9, height: 9 }} />
        <span className="scale-dot" style={{ left: at(peak) }} />
      </div>
      <Group justify="space-between" mb={8}>
        <Text size="xs" c="dimmed">
          Good
        </Text>
        <Text size="xs" c="dimmed">
          Extremely poor
        </Text>
      </Group>
      <div style={{ height: 190 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 4 }} barCategoryGap={daily ? '24%' : '18%'}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" {...axisProps} tickFormatter={(x) => (daily ? dayTick(x, data.length) : hourTick(x))} minTickGap={14} />
            <YAxis orientation="right" {...yAxisProps} width={40} domain={[0, Math.ceil(top)]} ticks={[0, ...AQI_BANDS.map((b) => b.max).filter((m) => m < top)]} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d || d.aqi == null) return null;
                return (
                  <TooltipCard
                    title={fullTime(d.t)}
                    rows={[
                      { label: aqiLabel(d.aqi), color: aqiColor(d.aqi), shape: 'bar', value: `AQI ${d.aqi}` },
                      { label: 'PM2.5', color: 'transparent', value: d.pm25 == null ? '–' : `${Math.round(d.pm25)} µg/m³` },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="aqi"
              maxBarSize={daily ? 22 : 8}
              isAnimationActive={false}
              shape={(p: any) => (p.height > 0 ? <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={Math.min(4, p.width / 2)} fill={aqiColor(p.payload.aqi)} /> : null)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

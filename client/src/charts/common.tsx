import type { ReactNode } from 'react';
import { Group, Text } from '@mantine/core';
import { formatValue, type Quantity, type UnitSystem } from '@wwa/shared';

/**
 * Shared chart chrome, following the dataviz method: recessive hairline grid and axes, 2 px lines,
 * bars capped at 24 px with 4 px rounded ends, one crosshair tooltip listing every series, and text
 * in ink tokens (never in the series color). Colors are CSS variables defined per color scheme in
 * styles.css (the validated reference palette).
 */
export const COLORS = {
  blue: 'var(--series-blue)',
  orange: 'var(--series-orange)',
  aqua: 'var(--series-aqua)',
  yellow: 'var(--series-yellow)',
  violet: 'var(--series-violet)',
  warm: 'var(--diverging-warm)',
  cool: 'var(--diverging-cool)',
  neutral: 'var(--diverging-neutral)',
  normal: 'var(--normal-band)',
};

/** Fixed categorical order for places: color follows the place's position, never its rank. */
export const PLACE_COLORS = [COLORS.blue, COLORS.orange, COLORS.aqua, COLORS.yellow];

export const axisProps = {
  stroke: 'var(--chart-axis)',
  tick: { fill: 'var(--ink-muted)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--chart-axis)' },
} as const;

export const yAxisProps = { ...axisProps, axisLine: false, width: 44 } as const;
export const gridProps = { stroke: 'var(--chart-grid)', vertical: false } as const;
export const cursorProps = { stroke: 'var(--ink-muted)', strokeWidth: 1 } as const;
export const barProps = { maxBarSize: 24, radius: [4, 4, 0, 0] as [number, number, number, number] };
export const lineProps = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', isAnimationActive: false } as const;
export const activeDot = { r: 5, stroke: 'var(--surface)', strokeWidth: 2 };

// ── Time labels (local times arrive as plain strings; format them without timezone shifts) ──────

const asDate = (t: string) => new Date(t.length === 10 ? `${t}T00:00:00Z` : `${t}:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' });
const WEEKDAY_DAY = fmt({ weekday: 'short', day: 'numeric' });
const DAY_MONTH = fmt({ day: 'numeric', month: 'short' });
const HOUR = fmt({ hour: '2-digit', minute: '2-digit' });
const FULL = fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const FULL_DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function dayTick(t: string, count: number) {
  return count <= 16 ? WEEKDAY_DAY.format(asDate(t)) : DAY_MONTH.format(asDate(t));
}

/** Hourly ticks: the hour, and the weekday at midnight so day boundaries are readable. */
export function hourTick(t: string) {
  const d = asDate(t);
  return d.getUTCHours() === 0 ? fmt({ weekday: 'short' }).format(d) : HOUR.format(d);
}

export const fullTime = (t: string) => (t.length === 10 ? FULL_DAY.format(asDate(t)) : FULL.format(asDate(t)));

// ── Tooltip ────────────────────────────────────────────────────────────────────────────────────

export interface TooltipRow {
  label: string;
  color: string;
  value: string;
  shape?: 'line' | 'bar';
}

export function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="card" style={{ padding: '8px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 150 }}>
      <Text size="xs" c="dimmed" mb={4}>
        {title}
      </Text>
      {rows.map((r) => (
        <Group key={r.label} gap={8} wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap">
            <Key color={r.color} shape={r.shape} />
            <Text size="xs" c="dimmed">
              {r.label}
            </Text>
          </Group>
          <Text size="sm" fw={600}>
            {r.value}
          </Text>
        </Group>
      ))}
    </div>
  );
}

/** Line keys for lines, small rounded rects for bars and bands. */
export function Key({ color, shape = 'line' }: { color: string; shape?: 'line' | 'bar' | 'band' }) {
  if (shape === 'line') return <span style={{ width: 12, height: 2, borderRadius: 1, background: color, display: 'inline-block' }} />;
  return <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block', opacity: shape === 'band' ? 0.9 : 1 }} />;
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'line' | 'bar' | 'band' }[] }) {
  return (
    <Group gap={14} mb={6}>
      {items.map((i) => (
        <Group key={i.label} gap={6} wrap="nowrap">
          <Key color={i.color} shape={i.shape} />
          <Text size="xs" c="dimmed">
            {i.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export const display = (v: number | null | undefined, q: Quantity, units: UnitSystem) => formatValue(v, q, units);

/** A domain padded past the data and snapped to clean steps, so ticks land on round numbers. */
export function paddedDomain(values: (number | null)[], floorZero = false): [number, number] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return [0, 10];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const step = niceStep((hi - lo) / 4 || 1);
  const min = floorZero ? 0 : Math.floor((lo - step * 0.3) / step) * step;
  const max = Math.ceil((hi + step * 0.3) / step) * step;
  return [min, max];
}

/** Ticks every `step` across a domain from paddedDomain. */
export function ticksFor([min, max]: [number, number]): number[] {
  const step = niceStep((max - min) / 4 || 1);
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function ChartFrame({ height, label, children }: { height: number; label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} style={{ height, width: '100%' }}>
      {children}
    </div>
  );
}

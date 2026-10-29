import type { ReactNode } from 'react';
import { Group, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import { weatherIcon } from '../components/weatherIcons';

/** The large summary above a chart: one to four big values, an optional icon, a caption on the right. */
export function Hero({ values, icon: HeroIcon, caption }: { values: { text: string; dim?: boolean }[]; icon?: Icon; caption?: ReactNode }) {
  return (
    <Group gap={10} align="center" mb={4} wrap="nowrap">
      {values.map((v) => (
        <Text key={v.text} fz={34} fw={v.dim ? 500 : 600} lh={1} c={v.dim ? 'dimmed' : undefined} style={{ letterSpacing: '-0.02em' }}>
          {v.text}
        </Text>
      ))}
      {HeroIcon && <HeroIcon size={30} stroke={1.5} color="var(--ink-secondary)" aria-hidden />}
      {caption && (
        <Text size="xs" c="dimmed" ml="auto" ta="right" lh={1.35}>
          {caption}
        </Text>
      )}
    </Group>
  );
}

export interface Conditions {
  code: number | null;
  isDay: boolean;
}

/** A condition icon above selected ticks of a top x-axis (moon at night). */
export function IconTick({ x, y, payload, byTime }: { x?: number; y?: number; payload?: { value: string }; byTime: Map<string, Conditions> }) {
  const row = payload ? byTime.get(payload.value) : undefined;
  if (x == null || y == null || !row || row.code == null) return null;
  const TickIcon = weatherIcon(row.code, row.isDay);
  return (
    <g transform={`translate(${x - 9}, ${y - 24})`}>
      <TickIcon size={18} stroke={1.6} color="var(--ink-secondary)" />
    </g>
  );
}

/** The condition that covers most (daytime) points of a window. */
export function dominantCode(rows: Conditions[]): number {
  const pool = rows.filter((r) => r.code != null && r.isDay);
  const counts = new Map<number, number>();
  for (const r of pool.length ? pool : rows.filter((x) => x.code != null)) counts.set(r.code!, (counts.get(r.code!) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3;
}

// ── Local time helpers (chart times are local strings; never shift them through a timezone) ─────

export const hourOf = (t: string) => Number(t.slice(11, 13));
const utc = (t: string) => new Date(t.length === 10 ? `${t}T00:00:00Z` : `${t}:00Z`);
export const weekdayShort = (t: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(t.slice(0, 10)));
export const dayMonth = (t: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(t.slice(0, 10)));

function localParts(timeZone: string) {
  try {
    return Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
  } catch {
    return null;
  }
}

/** Today at the place ("YYYY-MM-DD"). */
export function localDate(timeZone: string): string {
  const p = localParts(timeZone);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}

/** The current hour at the place, as a chart time key ("YYYY-MM-DDTHH:00"). */
export function localHour(timeZone: string): string {
  const p = localParts(timeZone);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:00` : '';
}

export const deg = (v: number) => `${Math.round(v)}°`;

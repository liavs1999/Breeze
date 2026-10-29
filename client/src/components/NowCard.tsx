import { Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { Sparkline } from '@mantine/charts';
import { convert, formatValue, type CurrentWeather } from '@wwa/shared';
import { useSettings } from '../lib/settings';
import { weatherIcon } from './weatherIcons';

/** Current conditions: one hero number, a few facts, and the next 24 hours as a sparkline. Not a chart. */
export function NowCard({ data }: { data: CurrentWeather & { stale?: boolean } }) {
  const { units } = useSettings().settings;
  const Icon = weatherIcon(data.weatherCode, data.isDay);
  const t = (v: number) => formatValue(v, 'temperature', units);
  const local = new Date(`${data.observedAt}:00Z`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const place = [data.place.name, data.place.country].filter(Boolean).join(', ');

  return (
    <div className="card" style={{ padding: 20 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            {place} · {local} local time
          </Text>
          <Group gap={12} align="center" wrap="nowrap">
            <Text fz={56} fw={600} lh={1.05} style={{ letterSpacing: '-0.02em' }}>
              {t(data.temperature)}
            </Text>
            <Icon size={40} stroke={1.4} color="var(--ink-secondary)" aria-hidden />
          </Group>
          <Text fw={500}>{data.condition}</Text>
          <Text size="sm" c="dimmed">
            Feels like {t(data.feelsLike)} · H {t(data.today.max)} · L {t(data.today.min)}
          </Text>
        </Stack>
        <Stack gap={4} align="flex-end" style={{ minWidth: 120, flex: '0 1 200px' }} visibleFrom="xs">
          <Sparkline
            w="100%"
            h={56}
            data={data.next24h.map((p) => convert(p.temperature, 'temperature', units))}
            color="var(--series-orange)"
            fillOpacity={0.12}
            strokeWidth={2}
            curveType="monotone"
            withGradient={false}
            aria-label="Temperature over the next 24 hours"
          />
          <Text size="xs" c="dimmed">
            Next 24 h
          </Text>
        </Stack>
      </Group>
      <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs" mt="md">
        <Fact label="Wind" value={`${formatValue(data.windSpeed, 'wind', units)}`} sub={`gusts ${formatValue(data.windGusts, 'wind', units)}`} />
        <Fact label="Humidity" value={`${data.humidity}%`} />
        <Fact label="Chance of rain" value={data.today.precipitationChance == null ? '–' : `${data.today.precipitationChance}%`} sub="today" />
        <Fact label="Cloud cover" value={`${data.cloudCover}%`} />
      </SimpleGrid>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: '8px 12px' }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600} size="sm">
        {value}
        {sub && (
          <Text span size="xs" c="dimmed" fw={400}>
            {' '}
            {sub}
          </Text>
        )}
      </Text>
    </div>
  );
}

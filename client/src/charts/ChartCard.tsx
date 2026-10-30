import { useMemo, useState } from 'react';
import { Box, Group, ScrollArea, Table, Text, UnstyledButton } from '@mantine/core';
import { IconArrowsShuffle, IconCalendar, IconChartLine, IconClock, IconDroplet, IconLeaf, IconTable, IconTemperature, type Icon } from '@tabler/icons-react';
import type { ChartSpec } from '@breeze/shared';
import { useSettings } from '../lib/settings';
import { renderChart } from './kinds';

/** The small uppercase label at the top of a card, with its icon. */
function sectionOf(spec: ChartSpec): { label: string; icon: Icon } {
  switch (spec.kind) {
    case 'temperature_range':
      return /-day forecast/.test(spec.title) ? { label: `${spec.days.length}-day forecast`, icon: IconCalendar } : { label: 'Daily temperatures', icon: IconCalendar };
    case 'hourly':
      return { label: spec.rainMeasure === 'probability' ? 'Hourly forecast' : 'Hour by hour', icon: IconClock };
    case 'precipitation':
      return { label: 'Precipitation', icon: IconDroplet };
    case 'compare':
      return { label: 'Comparison', icon: IconArrowsShuffle };
    case 'anomaly':
      return { label: 'Averages', icon: IconTemperature };
    case 'air_quality':
      return { label: 'Air quality', icon: IconLeaf };
  }
}

/**
 * A chart card: section label, the place and dates, the chart (fixed size per kind, so nothing jumps
 * while streaming), a "Data" toggle with the same values as a table, and the source.
 */
export function ChartCard({ spec }: { spec: ChartSpec }) {
  const { units } = useSettings().settings;
  const chart = useMemo(() => renderChart(spec, units), [spec, units]);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const section = sectionOf(spec);
  const SectionIcon = section.icon;

  return (
    <Box className="card chart-card" p={18} pb={12}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs" mb={10}>
        <div style={{ minWidth: 0 }}>
          <div className="card-label">
            <SectionIcon size={14} stroke={2} aria-hidden />
            {section.label}
          </div>
          <Text size="xs" c="dimmed" mt={4} truncate="end">
            {spec.subtitle}
          </Text>
        </div>
        <UnstyledButton
          onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
          aria-label={view === 'chart' ? 'Show data table' : 'Show chart'}
          className="pill-button"
        >
          {view === 'chart' ? <IconTable size={14} stroke={1.8} /> : <IconChartLine size={14} stroke={1.8} />}
          {view === 'chart' ? 'Data' : 'Chart'}
        </UnstyledButton>
      </Group>

      {view === 'chart' ? (
        chart.body
      ) : (
        <ScrollArea.Autosize mah={340} type="auto">
          <Table highlightOnHover verticalSpacing={5} fz="xs" stickyHeader>
            <Table.Thead>
              <Table.Tr>
                {chart.table.columns.map((col) => (
                  <Table.Th key={col}>{col}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {chart.table.rows.map((row, i) => (
                <Table.Tr key={i}>
                  {row.map((cell, k) => (
                    <Table.Td key={k}>{cell}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      )}

      <Text size="xs" c="dimmed" mt={10}>
        {spec.source}
      </Text>
    </Box>
  );
}

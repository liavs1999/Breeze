import { useMemo, useState } from 'react';
import { Box, Group, ScrollArea, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChartLine, IconTable } from '@tabler/icons-react';
import type { ChartSpec } from '@wwa/shared';
import { useSettings } from '../lib/settings';
import { Legend } from './common';
import { renderChart } from './kinds';

/**
 * The chart card: title, subtitle (place, dates, local time), legend for two or more series, the
 * chart at a fixed height (so the page never jumps), a "data" toggle with the same values as a
 * table, and the source.
 */
export function ChartCard({ spec }: { spec: ChartSpec }) {
  const { units } = useSettings().settings;
  const chart = useMemo(() => renderChart(spec, units), [spec, units]);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <Box className="card" p={18} pb={12}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <div style={{ minWidth: 0 }}>
          <Text fw={600} size="sm">
            {spec.title}
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            {spec.subtitle}
          </Text>
        </div>
        <UnstyledButton
          onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
          aria-label={view === 'chart' ? 'Show data table' : 'Show chart'}
          style={{ color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          {view === 'chart' ? <IconTable size={16} stroke={1.6} /> : <IconChartLine size={16} stroke={1.6} />}
          <Text size="xs">{view === 'chart' ? 'Data' : 'Chart'}</Text>
        </UnstyledButton>
      </Group>

      <Box mt="sm">
        {view === 'chart' ? (
          <>
            {chart.legend && <Legend items={chart.legend} />}
            {chart.body}
          </>
        ) : (
          <ScrollArea h={chart.legend ? 286 : 262} type="auto">
            <Table striped={false} highlightOnHover verticalSpacing={4} fz="xs" stickyHeader>
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
          </ScrollArea>
        )}
      </Box>

      <Text size="xs" c="dimmed" mt={8}>
        Source: {spec.source}
      </Text>
    </Box>
  );
}

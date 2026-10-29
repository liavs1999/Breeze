import { SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconChartLine, IconTemperature } from '@tabler/icons-react';
import { Logo } from './Logo';

/** Example questions: the first four produce a chart, the last shows the "now" card instead. */
export const EXAMPLES = [
  { text: 'What will the weather be like in Tokyo this week?', chart: true },
  { text: 'Will it rain in London in the next 24 hours?', chart: true },
  { text: 'Compare Paris, Rome and Madrid over the next 5 days', chart: true },
  { text: 'Was last month warmer than normal in New York?', chart: true },
  { text: "What's the temperature in Reykjavík right now?", chart: false },
  { text: "How's the air quality in Delhi over the next few days?", chart: true },
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <Stack align="center" gap="xl" pt={56} pb="xl" className="fade-in">
      <Stack align="center" gap={10}>
        <Logo size={44} />
        <Title order={2} fw={600} ta="center">
          Weather, anywhere
        </Title>
        <Text c="dimmed" ta="center" maw={420}>
          Ask about forecasts, past weather or air quality for any place. Questions about a period or a comparison come with a chart.
        </Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10} w="100%">
        {EXAMPLES.map((e) => (
          <UnstyledButton key={e.text} onClick={() => onPick(e.text)} className="card example" p="sm" px="md">
            <Text size="sm" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--ink-muted)', marginTop: 1, flexShrink: 0 }}>
                {e.chart ? <IconChartLine size={16} stroke={1.6} aria-label="With chart" /> : <IconTemperature size={16} stroke={1.6} aria-label="Current conditions" />}
              </span>
              {e.text}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

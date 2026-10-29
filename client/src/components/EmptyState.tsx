import { Group, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { IconArrowsShuffle, IconCalendar, IconLeaf, IconNavigation, IconTemperature, IconUmbrella, type Icon } from '@tabler/icons-react';
import { Logo } from './Logo';

/** Example questions, each marked with the kind of answer it gets (the README lists the same). */
export const EXAMPLES: { text: string; icon: Icon; color: string; hint: string }[] = [
  { text: 'What will the weather be like in Tokyo this week?', icon: IconCalendar, color: 'blue', hint: 'Daily forecast' },
  { text: 'Will it rain in London in the next 24 hours?', icon: IconUmbrella, color: 'cyan', hint: 'Hourly forecast' },
  { text: 'Compare Paris, Rome and Madrid over the next 5 days', icon: IconArrowsShuffle, color: 'violet', hint: 'Comparison' },
  { text: 'Was last month warmer than normal in New York?', icon: IconTemperature, color: 'orange', hint: 'Versus normal' },
  { text: "What's the temperature in Reykjavík right now?", icon: IconNavigation, color: 'indigo', hint: 'Right now' },
  { text: "How's the air quality in Delhi over the next few days?", icon: IconLeaf, color: 'teal', hint: 'Air quality' },
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <Stack align="center" gap={32} pt={64} pb="xl" className="fade-in">
      <Stack align="center" gap={8}>
        <Logo size={56} />
        <Title order={1} fz={34} fw={700} ta="center" mt={6} style={{ letterSpacing: '-0.025em' }}>
          Weather, anywhere
        </Title>
        <Text fz={17} c="dimmed" ta="center" maw={440} lh={1.45}>
          Ask about forecasts, past weather or air quality for any place in the world.
        </Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10} w="100%">
        {EXAMPLES.map((e) => (
          <UnstyledButton key={e.text} onClick={() => onPick(e.text)} className="card example" p={12} px={14}>
            <Group gap={12} wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color={e.color} radius="xl" size={32} style={{ flexShrink: 0 }}>
                <e.icon size={17} stroke={1.8} />
              </ThemeIcon>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} lh={1.35}>
                  {e.text}
                </Text>
                <Text size="xs" c="dimmed" mt={2}>
                  {e.hint}
                </Text>
              </div>
            </Group>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

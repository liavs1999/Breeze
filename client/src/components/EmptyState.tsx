import { Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconArrowsShuffle, IconCalendar, IconLeaf, IconNavigation, IconTemperature, IconUmbrella, type Icon } from '@tabler/icons-react';

/** Example questions, each marked with the kind of answer it gets (the README lists the same). */
export const EXAMPLES: { text: string; icon: Icon; tone: string; hint: string }[] = [
  { text: 'What will the weather be like in Tokyo this week?', icon: IconCalendar, tone: '#2f7fe0', hint: 'Daily forecast' },
  { text: 'Will it rain in London in the next 24 hours?', icon: IconUmbrella, tone: '#1c9fc7', hint: 'Hourly forecast' },
  { text: 'Compare Paris, Rome and Madrid over the next 5 days', icon: IconArrowsShuffle, tone: '#6d5ae0', hint: 'Comparison' },
  { text: 'Was last month warmer than normal in New York?', icon: IconTemperature, tone: '#ef7a35', hint: 'Versus normal' },
  { text: "What's the temperature in Reykjavík right now?", icon: IconNavigation, tone: '#4659d6', hint: 'Right now' },
  { text: "How's the air quality in Delhi over the next few days?", icon: IconLeaf, tone: '#1ea877', hint: 'Air quality' },
];

/** The welcome: the sun (or moon), a large title right on the open sky, and six glass questions. */
export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <Stack align="center" gap={40} pt="clamp(40px, 11vh, 120px)" pb="xl" className="fade-in">
      <Stack align="center" gap={14}>
        {/* The sun (or moon) of the sky backdrop rises into this slot: it is the welcome's mark. */}
        <div className="hero-sun-slot" aria-hidden />
        <h1 className="hero-title">Weather, anywhere</h1>
        <Text className="hero-sub">Ask about forecasts, past weather or air quality for any place in the world.</Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={10} w="100%">
        {EXAMPLES.map((e, i) => (
          <UnstyledButton
            key={e.text}
            onClick={() => onPick(e.text)}
            className="card example fade-in"
            p={12}
            px={14}
            style={{ animationDelay: `${120 + i * 50}ms`, borderRadius: 20 }}
          >
            <Group gap={12} wrap="nowrap" align="flex-start">
              <span className="example-icon" style={{ ['--tone' as string]: e.tone }}>
                <e.icon size={17} stroke={1.9} />
              </span>
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

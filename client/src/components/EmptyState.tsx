import { Stack, Text, UnstyledButton } from '@mantine/core';
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

/**
 * The welcome: a large title floating over the Earth (or, without WebGL, under the sun of the open
 * sky), and the six example questions as glass pills along the bottom, so the planet has the stage.
 */
export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="welcome fade-in">
      <Stack align="center" gap={12} className="welcome-head">
        {/* Without the globe, the sun (or moon) of the sky backdrop rises into this slot. */}
        <div className="hero-sun-slot" aria-hidden />
        <h1 className="hero-title">Weather, anywhere</h1>
        <Text className="hero-sub">Ask about forecasts, past weather or air quality for any place in the world.</Text>
      </Stack>
      <div className="examples">
        {EXAMPLES.map((e, i) => (
          <UnstyledButton key={e.text} onClick={() => onPick(e.text)} className="card example" style={{ animationDelay: `${600 + i * 70}ms` }}>
            <span className="example-icon" style={{ ['--tone' as string]: e.tone }}>
              <e.icon size={15} stroke={1.9} />
            </span>
            <span style={{ minWidth: 0 }}>
              <Text component="span" size="sm" fw={500} lh={1.3} className="example-text">
                {e.text}
              </Text>
              <Text component="span" size="xs" c="dimmed" className="example-hint">
                {e.hint}
              </Text>
            </span>
          </UnstyledButton>
        ))}
      </div>
    </div>
  );
}

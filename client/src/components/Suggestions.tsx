import { Group, UnstyledButton } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import { suggestionsFor } from '../lib/suggestions';
import type { ChatMessage } from '../lib/types';

/** Tappable next steps under the latest answer: the places to choose from, or follow-up questions. */
export function Suggestions({ message, onPick }: { message: ChatMessage | undefined; onPick: (text: string) => void }) {
  const found = suggestionsFor(message);
  if (!found) return null;
  return (
    <Group gap={8} className="fade-in" aria-label={found.kind === 'places' ? 'Choose a place' : 'Suggested questions'} role="group">
      {found.items.map((s) => (
        <UnstyledButton key={s.prompt} className="card suggestion" onClick={() => onPick(s.prompt)} title={s.prompt}>
          {found.kind === 'places' && <IconMapPin size={14} stroke={1.8} aria-hidden />}
          {s.label}
        </UnstyledButton>
      ))}
    </Group>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Group, Paper, Text, Textarea, Tooltip } from '@mantine/core';
import { IconArrowUp, IconPlayerStopFilled } from '@tabler/icons-react';
import { read, write } from '../lib/storage';

/** The input. The unsent draft survives a refresh (per chat); Enter sends, Shift+Enter adds a line. */
export function Composer({ chatId, busy, onSend, onStop }: { chatId: string; busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const draftKey = `atmos:draft:${chatId}`;
  const [text, setText] = useState(() => read(draftKey) ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => write(draftKey, text || null), [draftKey, text]);
  useEffect(() => ref.current?.focus(), []);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText('');
  };

  return (
    <div style={{ position: 'sticky', bottom: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, var(--mantine-color-body) 70%, transparent)' }}>
      <div className="column">
        <Paper className="card" p={6} pl={14} shadow="xs">
          <Group gap={6} align="flex-end" wrap="nowrap">
            <Textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about the weather anywhere…"
              autosize
              minRows={1}
              maxRows={6}
              variant="unstyled"
              style={{ flex: 1 }}
              styles={{ input: { fontSize: 15, paddingTop: 7, paddingBottom: 7 } }}
              aria-label="Message"
              maxLength={2000}
            />
            {busy ? (
              <Tooltip label="Stop">
                <ActionIcon size={36} radius="xl" variant="filled" color="dark" onClick={onStop} aria-label="Stop the answer">
                  <IconPlayerStopFilled size={14} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <ActionIcon size={36} radius="xl" variant="filled" onClick={submit} disabled={!text.trim()} aria-label="Send">
                <IconArrowUp size={18} stroke={2.2} />
              </ActionIcon>
            )}
          </Group>
        </Paper>
        <Text size="xs" c="dimmed" ta="center" mt={6}>
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
            Open-Meteo
          </a>{' '}
          (CC BY 4.0). Answers can be wrong; check official warnings for safety decisions.
        </Text>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Group, Paper, Text, Textarea, Tooltip } from '@mantine/core';
import { IconArrowUp, IconMicrophone, IconPlayerStopFilled } from '@tabler/icons-react';
import { dictationSupported, useDictation } from '../lib/dictation';
import { read, write } from '../lib/storage';

/**
 * The input. The unsent draft survives a refresh (per chat); Enter sends, Shift+Enter adds a line.
 * The microphone dictates into the input.
 */
export function Composer({ chatId, busy, onSend, onStop }: { chatId: string; busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const draftKey = `breeze:draft:${chatId}`;
  const [text, setText] = useState(() => read(draftKey) ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(setText);

  useEffect(() => write(draftKey, text || null), [draftKey, text]);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => setNotice(dictation.error), [dictation.error]);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    dictation.stop();
    onSend(value);
    setText('');
  };

  const toggleDictation = () => {
    setNotice(null);
    if (dictation.listening) dictation.stop();
    else dictation.start(text);
    ref.current?.focus();
  };

  return (
    <div className="composer-dock">
      <div className="column">
        <div className="composer" data-busy={busy}>
        <Paper className="card" p={7} pl={15} style={{ borderRadius: 30 }}>
          <Group gap={2} align="flex-end" wrap="nowrap">
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
              placeholder={dictation.listening ? 'Listening…' : 'Ask about the weather anywhere…'}
              autosize
              minRows={1}
              maxRows={6}
              variant="unstyled"
              style={{ flex: 1 }}
              styles={{ input: { fontSize: 16, letterSpacing: '-0.012em', paddingTop: 7, paddingBottom: 7 } }}
              aria-label="Message"
              maxLength={2000}
            />
            {dictationSupported && (
              <Tooltip label={dictation.listening ? 'Stop dictating' : 'Speak your question'}>
                <ActionIcon
                  size={34}
                  radius="xl"
                  variant={dictation.listening ? 'light' : 'subtle'}
                  color={dictation.listening ? 'red' : 'gray'}
                  className={dictation.listening ? 'listening' : undefined}
                  onClick={toggleDictation}
                  disabled={busy}
                  aria-label={dictation.listening ? 'Stop dictating' : 'Speak your question'}
                  aria-pressed={dictation.listening}
                >
                  <IconMicrophone size={19} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            )}
            {busy ? (
              <Tooltip label="Stop">
                <ActionIcon size={34} radius="xl" variant="filled" className="radar-stop" onClick={onStop} aria-label="Stop the answer">
                  <IconPlayerStopFilled size={14} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <ActionIcon size={34} radius="xl" variant="filled" className="send-button" onClick={submit} disabled={!text.trim()} aria-label="Send">
                <IconArrowUp size={18} stroke={2.2} />
              </ActionIcon>
            )}
          </Group>
        </Paper>
        </div>
        <Text size="xs" className="footnote" ta="center" mt={8} role="status" aria-live="polite">
          {notice ?? (
            <>
              Weather data by{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>{' '}
              (CC BY 4.0). Answers can be wrong; check official warnings for safety decisions.
            </>
          )}
        </Text>
      </div>
    </div>
  );
}

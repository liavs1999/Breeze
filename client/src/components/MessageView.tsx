import { useState } from 'react';
import { Box, Collapse, Group, Loader, Skeleton, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconChevronDown, IconDatabase } from '@tabler/icons-react';
import type { ChatMessage, MessagePart } from '../lib/types';
import { ChartCard } from '../charts/ChartCard';
import { PartBoundary } from './ErrorBoundary';
import { Markdown } from './Markdown';
import { NowCard } from './NowCard';

type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>;
const isTool = (p: MessagePart): p is ToolPart => p.type.startsWith('tool-');

export function MessageView({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <Box className="fade-in" style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
        <div className="bubble-user">{text}</div>
      </Box>
    );
  }

  // Natural order, with consecutive data-tool calls grouped into one quiet "steps" line.
  const blocks: React.ReactNode[] = [];
  let steps: ToolPart[] = [];
  const flush = (key: string) => {
    if (steps.length) blocks.push(<Steps key={`steps-${key}`} parts={steps} streaming={streaming} />);
    steps = [];
  };

  message.parts.forEach((part, i) => {
    if (part.type === 'text') {
      if (!part.text.trim()) return;
      flush(String(i));
      blocks.push(<Markdown key={i} text={part.text} streaming={streaming && part.state === 'streaming'} />);
    } else if (part.type === 'tool-show_chart') {
      flush(String(i));
      blocks.push(<ChartPart key={i} part={part} />);
    } else if (isTool(part)) {
      steps.push(part);
      if (part.type === 'tool-get_current') {
        flush(String(i));
        blocks.push(<NowPart key={i} part={part} />);
      }
    }
  });
  flush('end');

  return (
    <Box className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocks}
      {!streaming && <AnswerFooter message={message} />}
    </Box>
  );
}

function ChartPart({ part }: { part: Extract<MessagePart, { type: 'tool-show_chart' }> }) {
  if (part.state === 'output-available') {
    return (
      <PartBoundary label="chart">
        <ChartCard spec={part.output} />
      </PartBoundary>
    );
  }
  if (part.state === 'output-error') {
    // The agent sees the reason and answers in text; the reader only needs a quiet note.
    return null;
  }
  return <Skeleton h={300} radius="lg" aria-label="Drawing chart" />;
}

function NowPart({ part }: { part: Extract<MessagePart, { type: 'tool-get_current' }> }) {
  if (part.state === 'output-available') {
    return (
      <PartBoundary label="weather card">
        <NowCard data={part.output} />
      </PartBoundary>
    );
  }
  if (part.state === 'output-error') return null;
  return <Skeleton h={168} radius="lg" aria-label="Loading current weather" />;
}

// ── Steps ──────────────────────────────────────────────────────────────────────────────────────

function stepLabel(part: ToolPart): string {
  const input = (part.input ?? {}) as Record<string, any>;
  const output = (part.state === 'output-available' ? part.output : undefined) as Record<string, any> | undefined;
  const place = output?.resolved_to ?? output?.place?.name ?? input.place ?? '';
  switch (part.type) {
    case 'tool-find_place':
      return `Looking up “${input.query ?? ''}”`;
    case 'tool-get_current':
      return `Current conditions · ${place}`;
    case 'tool-get_forecast':
      return input.granularity === 'hourly' ? `${input.hours ?? 48}-hour forecast · ${place}` : `${input.days ?? 7}-day forecast · ${place}`;
    case 'tool-get_history':
      return `Past weather ${input.start_date ?? ''} – ${input.end_date ?? ''}${input.compare_to_normal ? ' vs normal' : ''} · ${place}`;
    case 'tool-get_air_quality':
      return `Air quality · ${place}`;
    default:
      return part.type.replace('tool-', '');
  }
}

/** One quiet line per group of tool calls: what the agent fetched, with live state. Expandable afterwards. */
function Steps({ parts, streaming }: { parts: ToolPart[]; streaming: boolean }) {
  const running = parts.some((p) => p.state === 'input-streaming' || p.state === 'input-available');
  const [open, setOpen] = useState(false);
  const expanded = streaming || running || open;

  return (
    <Box>
      {!streaming && !running && (
        <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Group gap={6} c="dimmed">
            <IconDatabase size={14} stroke={1.6} />
            <Text size="xs">
              {parts.length} {parts.length === 1 ? 'step' : 'steps'}
            </Text>
            <IconChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
          </Group>
        </UnstyledButton>
      )}
      <Collapse expanded={expanded} transitionDuration={150}>
        <Box mt={!streaming && !running ? 6 : 0} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {parts.map((p) => (
            <Group key={p.toolCallId} gap={8} wrap="nowrap">
              <StepIcon part={p} />
              <Text size="sm" c="dimmed" truncate>
                {stepLabel(p)}
              </Text>
            </Group>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function StepIcon({ part }: { part: ToolPart }) {
  if (part.state === 'output-available') return <IconCheck size={14} color="var(--mantine-color-teal-6)" style={{ flexShrink: 0 }} />;
  if (part.state === 'output-error') {
    return (
      <Tooltip label={part.errorText} multiline maw={320}>
        <IconAlertCircle size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
      </Tooltip>
    );
  }
  return <Loader size={12} style={{ flexShrink: 0 }} />;
}

function AnswerFooter({ message }: { message: ChatMessage }) {
  const m = message.metadata;
  if (!m?.model && !m?.staleData) return null;
  return (
    <Group gap={8}>
      {m.model && (
        <Tooltip label={m.inputTokens != null ? `${m.inputTokens.toLocaleString()} input · ${(m.outputTokens ?? 0).toLocaleString()} output tokens` : 'Model'}>
          <Text size="xs" c="dimmed">
            {m.model}
            {m.durationMs != null && ` · ${(m.durationMs / 1000).toFixed(1)} s`}
          </Text>
        </Tooltip>
      )}
      {m.fallback && (
        <Tooltip label="The chosen model was rate-limited, so a backup model answered.">
          <Text size="xs" c="yellow.8">
            backup model
          </Text>
        </Tooltip>
      )}
      {m.staleData && (
        <Text size="xs" c="yellow.8">
          The weather service failed, so some data came from the cache.
        </Text>
      )}
    </Group>
  );
}

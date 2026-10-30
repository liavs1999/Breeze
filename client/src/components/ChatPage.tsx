import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId } from 'ai';
import { Alert, Button, Group, Loader, Skeleton, Stack, Text } from '@mantine/core';
import { useDocumentVisibility, useNetwork } from '@mantine/hooks';
import { IconAlertTriangle, IconCopy, IconKey, IconRefresh, IconWifiOff } from '@tabler/icons-react';
import { api, KEY_ERRORS, parseChatError, withRetry, type LoadedChat } from '../lib/api';
import { getSettings, requestHeaders } from '../lib/settings';
import { checkSavedKey, markKeyProblem } from '../lib/status';
import type { ChatMessage } from '../lib/types';
import { read, write } from '../lib/storage';
import { setCurrentChatEmpty } from '../lib/currentChat';
import { skyFromMessages } from '../lib/sky';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';
import { MessageView } from './MessageView';
import { Suggestions } from './Suggestions';

/** Loads the saved conversation first (so a refresh shows it instantly), then mounts the live chat. */
export function ChatPage({ chatId, onOpenKeyPanel }: { chatId: string; onOpenKeyPanel: () => void }) {
  const [loaded, setLoaded] = useState<LoadedChat | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    withRetry(() => api.chat(chatId))
      .then(setLoaded)
      .catch(() => setFailed(true));
  }, [chatId]);
  useEffect(load, [load]);

  if (failed) {
    return (
      <main className="column" style={{ flex: 1, paddingTop: 48 }}>
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Cannot reach the server">
          <Group justify="space-between">
            <Text size="sm">The chat could not be loaded.</Text>
            <Button size="xs" variant="light" color="red" leftSection={<IconRefresh size={14} />} onClick={load}>
              Try again
            </Button>
          </Group>
        </Alert>
      </main>
    );
  }
  if (!loaded) return <ChatSkeleton />;
  return <Conversation chatId={chatId} initial={loaded} onOpenKeyPanel={onOpenKeyPanel} />;
}

function Conversation({ chatId, initial, onOpenKeyPanel }: { chatId: string; initial: LoadedChat; onOpenKeyPanel: () => void }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        headers: () => requestHeaders(),
        // Only the newest message is sent; the server keeps the conversation.
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: {
            id,
            message: messages[messages.length - 1],
            trigger,
            messageId,
            units: getSettings().settings.units,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop, regenerate, resumeStream, setMessages, clearError } = useChat<ChatMessage>({
    id: chatId,
    messages: initial.messages,
    transport,
    // Reattach to an answer that was still being written when the page loaded.
    resume: initial.streaming,
    experimental_throttle: 40,
    onError: (e) => {
      const { code, message } = parseChatError(e);
      if (KEY_ERRORS.has(code)) {
        if (code !== 'no_key' && code !== 'server_key_limit') markKeyProblem(message);
        onOpenKeyPanel();
      }
    },
    onFinish: ({ message }) => {
      if (!message.parts.some((p) => p.type === 'text' || p.type.startsWith('tool-'))) void checkSavedKey();
    },
  });

  const busy = status === 'submitted' || status === 'streaming';
  const isEmpty = messages.length === 0 && !busy;
  useEffect(() => skyFromMessages(messages), [messages]);
  useEffect(() => {
    setCurrentChatEmpty(isEmpty);
    return () => setCurrentChatEmpty(false);
  }, [isEmpty]);
  const chatError = error ? parseChatError(error) : null;
  const reconnecting = useReconnect({ chatId, failed: chatError?.code === 'network', resumeStream, setMessages, clearError });
  const { online } = useNetwork();

  const lastMessage = messages[messages.length - 1];
  // The server stopped mid-answer (for example it restarted): offer to answer again. A short grace
  // period avoids flashing this while an in-progress answer is being reattached after a reload.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const interrupted = settled && !busy && !error && lastMessage?.role === 'user' && !reconnecting;

  const send = (text: string) => {
    clearError();
    void sendMessage({ text });
  };
  const handleStop = async () => {
    await api.stop(chatId).catch(() => {});
    await stop();
  };

  useScrollMemory(chatId, messages.length);
  useTabTitle(messages);
  const readOnly = initial.readOnly;

  return (
    <>
      {!online && (
        <Banner icon={<IconWifiOff size={16} />}>You are offline. Answers keep running on the server; this chat reconnects automatically.</Banner>
      )}
      <main className="column" style={{ flex: 1, paddingTop: 8, paddingBottom: 24 }}>
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          <Stack gap={26} pt="md">
            {messages.map((m, i) => (
              <MessageView key={m.id} message={m} streaming={busy && i === messages.length - 1 && m.role === 'assistant'} />
            ))}
            {busy && !hasVisibleContent(lastMessage) && <Thinking />}
            {reconnecting && <Reconnecting />}
            {chatError && chatError.code !== 'network' && (
              <ErrorNotice code={chatError.code} message={chatError.message} onRetry={() => (clearError(), void regenerate())} onOpenKeyPanel={onOpenKeyPanel} />
            )}
            {chatError?.code === 'network' && !reconnecting && (
              <ErrorNotice code="network" message="The connection was interrupted." onRetry={() => (clearError(), void regenerate())} onOpenKeyPanel={onOpenKeyPanel} />
            )}
            {interrupted && !readOnly && (
              <ErrorNotice code="interrupted" message="This answer was interrupted." onRetry={() => void regenerate()} onOpenKeyPanel={onOpenKeyPanel} />
            )}
            {!busy && !chatError && !reconnecting && !readOnly && <Suggestions message={lastMessage} onPick={send} />}
          </Stack>
        )}
      </main>
      {readOnly ? <SharedChatBar chatId={chatId} /> : <Composer chatId={chatId} busy={busy} onSend={send} onStop={handleStop} />}
    </>
  );
}

/** The browser tab names the chat (its first question), so several open chats can be told apart. */
function useTabTitle(messages: ChatMessage[]) {
  const first = messages.find((m) => m.role === 'user')?.parts.find((p) => p.type === 'text')?.text.trim();
  useEffect(() => {
    document.title = first ? `${first.length > 50 ? `${first.slice(0, 48)}…` : first} · Breeze` : 'Breeze · weather chat';
    return () => {
      document.title = 'Breeze · weather chat';
    };
  }, [first]);
}

/** In place of the input on someone else's chat: it can be read, or copied to continue it. */
function SharedChatBar({ chatId }: { chatId: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'copying' | 'failed'>('idle');
  const copy = () => {
    setState('copying');
    api
      .copyChat(chatId, generateId())
      .then(({ id }) => navigate(`/c/${id}`))
      .catch(() => setState('failed'));
  };
  return (
    <div style={{ position: 'sticky', bottom: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))', paddingTop: 18, background: 'linear-gradient(to top, var(--mantine-color-body) 55%, transparent)' }}>
      <div className="column">
        <Group className="card" justify="space-between" gap="sm" p={10} pl={18} style={{ borderRadius: 28 }}>
          <Text size="sm" c="dimmed">
            {state === 'failed' ? 'The copy could not be made. Try again.' : 'A chat shared with you. It is read-only.'}
          </Text>
          <Button size="sm" radius="xl" leftSection={<IconCopy size={15} />} loading={state === 'copying'} onClick={copy}>
            Continue as my chat
          </Button>
        </Group>
      </div>
    </div>
  );
}

/**
 * After a dropped connection (network loss, sleep, a proxy cut), reattach without user action:
 * the answer kept running on the server, so either resume its stream (full replay, no duplicates)
 * or, if it already finished, load the saved result. Retries with backoff, and immediately when the
 * browser comes back online or the tab becomes visible.
 */
function useReconnect({
  chatId,
  failed,
  resumeStream,
  setMessages,
  clearError,
}: {
  chatId: string;
  failed: boolean;
  resumeStream: () => Promise<void>;
  setMessages: (m: ChatMessage[]) => void;
  clearError: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const { online } = useNetwork();
  const visibility = useDocumentVisibility();
  const actions = useRef({ resumeStream, setMessages, clearError });
  actions.current = { resumeStream, setMessages, clearError };
  const canTry = failed && online && visibility !== 'hidden';

  useEffect(() => {
    if (!failed) setAttempt(0);
  }, [failed]);

  useEffect(() => {
    if (!canTry) return;
    let cancelled = false;
    const delay = attempt === 0 ? 300 : Math.min(8000, 1000 * 2 ** (attempt - 1));
    const timer = setTimeout(async () => {
      try {
        const chat = await api.chat(chatId);
        if (cancelled) return;
        actions.current.clearError();
        if (chat.streaming) await actions.current.resumeStream();
        else actions.current.setMessages(chat.messages);
      } catch {
        if (!cancelled) setAttempt((a) => a + 1);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canTry, attempt, chatId]);

  return canTry;
}

/**
 * Restores the scroll position after a refresh, and follows the answer while it grows, unless the
 * reader scrolled up. "Following" is decided before the content grows (on scroll), not after, so a
 * chart that appears at once does not break it.
 */
function useScrollMemory(chatId: string, count: number) {
  const follow = useRef(true);

  useEffect(() => {
    const saved = Number(read(`breeze:scroll:${chatId}`, 'session'));
    requestAnimationFrame(() => window.scrollTo({ top: Number.isFinite(saved) && saved > 0 ? saved : document.documentElement.scrollHeight }));
    const onScroll = () => {
      follow.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
      write(`breeze:scroll:${chatId}`, String(Math.round(window.scrollY)), 'session');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Growth that is not a scroll (streamed text, a chart appearing): keep following.
    const observer = new ResizeObserver(() => {
      if (follow.current) window.scrollTo({ top: document.documentElement.scrollHeight });
    });
    // The app container grows with the content (the body itself is fixed at the window height).
    const app = document.querySelector('.app');
    if (app) observer.observe(app);
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [chatId]);

  // A new message (the user just sent one) brings the bottom into view; not on first load, where
  // the saved position wins.
  const initialCount = useRef(count);
  useEffect(() => {
    if (count === initialCount.current) return;
    follow.current = true;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, [count]);
}

function Banner({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--mantine-color-yellow-light)', borderBottom: '1px solid var(--hairline)' }}>
      <Group className="column" gap={8} py={6} wrap="nowrap">
        {icon}
        <Text size="sm">{children}</Text>
      </Group>
    </div>
  );
}

/** True once the answer shows something: text, a tool step, a card or a chart. */
function hasVisibleContent(m: ChatMessage | undefined) {
  if (!m || m.role !== 'assistant') return false;
  return m.parts.some((p) => (p.type === 'text' && p.text.trim()) || p.type.startsWith('tool-'));
}

function Thinking() {
  return (
    <Text size="sm" fw={500} className="fade-in shimmer">
      Thinking…
    </Text>
  );
}

function Reconnecting() {
  return (
    <Group gap={8} c="dimmed" className="fade-in">
      <Loader size={14} />
      <Text size="sm">Reconnecting to the answer…</Text>
    </Group>
  );
}

function ErrorNotice({ code, message, onRetry, onOpenKeyPanel }: { code: string; message: string; onRetry: () => void; onOpenKeyPanel: () => void }) {
  const keyIssue = KEY_ERRORS.has(code);
  return (
    <Alert variant="light" color={code === 'rate_limited' || code === 'server_key_limit' ? 'yellow' : 'red'} icon={<IconAlertTriangle size={18} />} className="fade-in">
      <Group justify="space-between" gap="xs">
        <Text size="sm" style={{ flex: 1, minWidth: 200 }}>
          {message}
        </Text>
        <Group gap={6}>
          {keyIssue && (
            <Button size="xs" variant="light" leftSection={<IconKey size={14} />} onClick={onOpenKeyPanel}>
              Model & key
            </Button>
          )}
          <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={onRetry}>
            Retry
          </Button>
        </Group>
      </Group>
    </Alert>
  );
}

function ChatSkeleton() {
  return (
    <main className="column" style={{ flex: 1, paddingTop: 24 }}>
      <Stack gap="lg">
        <Skeleton h={36} w="55%" ml="auto" radius="lg" />
        <Skeleton h={14} w="80%" />
        <Skeleton h={14} w="65%" />
        <Skeleton h={220} radius="lg" />
      </Stack>
    </main>
  );
}

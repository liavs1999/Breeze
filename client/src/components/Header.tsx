import { ActionIcon, Badge, Group, Menu, SegmentedControl, Text, Tooltip, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconHistory, IconKey, IconMoon, IconPlus, IconSun, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PROVIDER_INFO, type ChatSummary } from '@wwa/shared';
import { api } from '../lib/api';
import { isCurrentChatEmpty } from '../lib/currentChat';
import { updateSettings, useSettings } from '../lib/settings';
import { useAppStatus } from '../lib/status';
import { Logo } from './Logo';

export function Header({ onOpenKeyPanel }: { onOpenKeyPanel: () => void }) {
  const navigate = useNavigate();
  // Already on an empty chat: stay (and focus the input) rather than opening yet another one.
  const goHome = () => {
    if (isCurrentChatEmpty()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus();
      return;
    }
    navigate('/');
  };
  const { settings } = useSettings();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 10, WebkitBackdropFilter: 'blur(20px) saturate(180%)', backdropFilter: 'blur(20px) saturate(180%)', background: 'color-mix(in srgb, var(--mantine-color-body) 55%, transparent)' }}>
      <Group className="column" justify="space-between" h={56} wrap="nowrap" gap="xs">
        <UnstyledButton onClick={goHome} aria-label="Breeze home">
          <Group gap={8} wrap="nowrap">
            <Logo />
            <Text fw={700} fz={17} style={{ letterSpacing: '-0.01em' }}>
              Breeze
            </Text>
          </Group>
        </UnstyledButton>
        <Group gap={6} wrap="nowrap">
          <KeyBadge onClick={onOpenKeyPanel} />
          <ActionIcon variant="subtle" color="gray" size="lg" radius="xl" onClick={onOpenKeyPanel} aria-label="Model and key" hiddenFrom="xs">
            <IconKey size={18} stroke={1.6} />
          </ActionIcon>
          <SegmentedControl
            size="xs"
            radius="xl"
            value={settings.units}
            onChange={(v) => updateSettings({ units: v as 'metric' | 'imperial' })}
            data={[
              { label: '°C', value: 'metric' },
              { label: '°F', value: 'imperial' },
            ]}
            aria-label="Units"
          />
          <Tooltip label={scheme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <ActionIcon variant="subtle" color="gray" size="lg" radius="xl" onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color scheme">
              {scheme === 'dark' ? <IconSun size={18} stroke={1.6} /> : <IconMoon size={18} stroke={1.6} />}
            </ActionIcon>
          </Tooltip>
          <HistoryMenu />
          <Tooltip label="New chat">
            <ActionIcon variant="subtle" color="gray" size="lg" radius="xl" onClick={goHome} aria-label="New chat">
              <IconPlus size={18} stroke={1.6} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </header>
  );
}

/** Which key answers and whether it works; opens the key panel. */
function KeyBadge({ onClick }: { onClick: () => void }) {
  const { health, key, serverReachable } = useAppStatus();
  const { settings, apiKey } = useSettings();

  let color = 'gray';
  let label = 'Add API key';
  if (!serverReachable) {
    color = 'red';
    label = 'Server offline';
  } else if (apiKey) {
    const model = settings.model || PROVIDER_INFO[settings.provider].defaultModel;
    if (key.state === 'checking') label = 'Checking key…';
    else if (key.state === 'ok') {
      color = 'teal';
      label = `${model} · ready`;
    } else if (key.state === 'problem') {
      color = key.result?.status === 'rate_limited' ? 'yellow' : 'red';
      label = key.result?.status === 'rate_limited' ? 'Key rate-limited' : 'Key problem';
    } else label = 'Your key';
  } else if (health?.serverKey) {
    color = 'sky';
    label = 'Server key';
  }

  return (
    <Tooltip label={apiKey ? key.result?.message ?? 'Model and key' : health?.serverKey ? `Using the server key from server/.env (${health.serverKey.model}). Add your own any time.` : 'Add a key to start'}>
      <Badge
        component="button"
        onClick={onClick}
        variant="light"
        color={color}
        size="lg"
        radius="xl"
        tt="none"
        fw={500}
        leftSection={<span style={{ width: 7, height: 7, borderRadius: 99, background: 'currentColor', display: 'inline-block' }} />}
        style={{ cursor: 'pointer', maxWidth: 210 }}
        visibleFrom="xs"
      >
        {label}
      </Badge>
    </Tooltip>
  );
}

function HistoryMenu() {
  const navigate = useNavigate();
  const { id: current } = useParams();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);

  return (
    <Menu
      width={320}
      position="bottom-end"
      onOpen={() => api.chats().then(setChats, () => setChats([]))}
      // The label must be allowed to shrink, or long titles push the delete button out of the menu.
      styles={{ itemLabel: { minWidth: 0, overflow: 'hidden' }, itemSection: { flexShrink: 0 } }}
    >
      <Menu.Target>
        <Tooltip label="Recent chats">
          <ActionIcon variant="subtle" color="gray" size="lg" radius="xl" aria-label="Recent chats">
            <IconHistory size={18} stroke={1.6} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown mah={420} style={{ overflowY: 'auto' }}>
        <Menu.Label>Recent chats</Menu.Label>
        {chats === null && <Menu.Item disabled>Loading…</Menu.Item>}
        {chats?.length === 0 && <Menu.Item disabled>No chats yet</Menu.Item>}
        {chats?.map((c) => (
          <Menu.Item
            key={c.id}
            onClick={() => navigate(`/c/${c.id}`)}
            bg={c.id === current ? 'var(--surface-muted)' : undefined}
            rightSection={
              <ActionIcon
                component="span"
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={`Delete chat: ${c.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void api.deleteChat(c.id).then(() => {
                    setChats((list) => list?.filter((x) => x.id !== c.id) ?? null);
                    if (c.id === current) navigate('/');
                  });
                }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            }
          >
            <Text size="sm" truncate="end" fw={c.id === current ? 600 : undefined} title={c.title}>
              {c.title}
            </Text>
            <Text size="xs" c="dimmed">
              {timeAgo(c.updatedAt)}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return RELATIVE.format(-hours, 'hour');
  return RELATIVE.format(-Math.round(hours / 24), 'day');
}

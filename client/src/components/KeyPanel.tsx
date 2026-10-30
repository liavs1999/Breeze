import { useEffect, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Button, Checkbox, Group, Loader, Modal, Radio, Select, Stack, Text, TextInput, VisuallyHidden } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconKey, IconRefresh } from '@tabler/icons-react';
import { PROVIDER_INFO, PROVIDERS, type KeyCheckResult, type ProviderId } from '@breeze/shared';
import { api, ApiError } from '../lib/api';
import { clearKey, maskKey, saveKey, updateSettings, useSettings } from '../lib/settings';
import { serverKeyFor, setKeyResult, useAppStatus } from '../lib/status';
import { read, write } from '../lib/storage';

const usable = (r: KeyCheckResult | undefined): r is KeyCheckResult => r?.status === 'ok' || r?.status === 'rate_limited';

/** The last check of each key (by its source, provider and last four characters; never the key). */
interface ModelCheck {
  id: string;
  models: string[];
  results: Record<string, KeyCheckResult>;
  checkedAt: number;
}
const CHECKS = 'breeze:model-checks';
function savedChecks(): Record<string, ModelCheck> {
  try {
    return JSON.parse(read(CHECKS) ?? '{}');
  } catch {
    return {};
  }
}
function storeCheck(id: string, check: ModelCheck | null) {
  const all = savedChecks();
  if (check) all[id] = check;
  else delete all[id];
  write(CHECKS, JSON.stringify(all));
}

/**
 * "Model & key": the key in use (pasted in this browser, or one from server/.env) and the models it can
 * use, from the last check. Pasting a key checks it at once; once a model works the key is saved with
 * it. Clicking a working model switches to it immediately. The panel closes only with Done.
 */
export function KeyPanel({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { settings, apiKey } = useSettings();
  const { health } = useAppStatus();
  const envKeys = health?.serverKeys ?? [];
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [typed, setTyped] = useState('');
  const [remember, setRemember] = useState(settings.remember);
  const [live, setLive] = useState<ModelCheck | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extra, setExtra] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!opened) return;
    setProvider(apiKey ? settings.provider : serverKeyFor(health, settings.provider)?.provider ?? settings.provider);
    setRemember(settings.remember);
    setTyped('');
    setLive(null);
    setExtraOpen(false);
    setRequestError(null);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = PROVIDER_INFO[provider];
  const env = envKeys.find((k) => k.provider === provider) ?? null;
  const key = typed.trim();
  const savedHere = Boolean(apiKey) && provider === settings.provider;
  // A key in server/.env answers when no key is pasted in this browser.
  const envHere = !apiKey && Boolean(env);
  const pastedId = (k: string) => `pasted:${provider}:${maskKey(k)}`;
  const activeId = key ? pastedId(key) : savedHere ? pastedId(apiKey) : envHere && env ? `env:${provider}:${env.keyHint}` : null;
  const shown = live?.id === activeId ? live : activeId ? savedChecks()[activeId] : undefined;
  const checking = Boolean(live && live.id === activeId && live.models.some((m) => !live.results[m]));
  const rejection = shown && Object.values(shown.results).find((r) => r.status === 'invalid_key');
  /** The model this key answers with now (nothing yet for a key that is still being checked). */
  const inUse = savedHere
    ? settings.model || info.defaultModel
    : envHere && env
      ? (settings.provider === provider && settings.model) || env.model
      : null;

  function close() {
    onClose();
    // Straight to asking: the chat input, once the panel has closed.
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 250);
  }

  /**
   * Checks models with a key (undefined: the key in server/.env). A newly pasted key is saved as soon as
   * its preferred model works, or with the first that works once all have answered.
   */
  function check(models: string[], keyToCheck: string | undefined, id: string, opts: { adopt?: boolean; merge?: boolean } = {}) {
    const runId = opts.merge ? run.current : ++run.current;
    const base: ModelCheck = opts.merge && shown ? { ...shown, models: [...new Set([...shown.models, ...models])] } : { id, models, results: {}, checkedAt: Date.now() };
    setLive(base);
    setRequestError(null);
    const found: Record<string, KeyCheckResult> = { ...base.results };
    let adopted = !opts.adopt;
    const preferred = inUse ?? info.defaultModel;
    for (const model of models) {
      api
        .checkKey({ provider, key: keyToCheck, model })
        .catch((error): KeyCheckResult => ({ provider, model, status: 'error', message: error instanceof ApiError ? error.message : 'The check failed.' }))
        .then((r) => {
          if (run.current !== runId) return;
          found[model] = r;
          setLive((prev) => {
            const next = prev && prev.id === id ? { ...prev, results: { ...prev.results, [model]: r } } : prev;
            if (next) storeCheck(id, next);
            return next;
          });
          if (r.status === 'error' && /too many/i.test(r.message)) setRequestError(r.message);
          if (adopted) return;
          const done = base.models.every((m) => found[m]);
          const best = found[preferred]?.status === 'ok' ? found[preferred] : done ? base.models.map((m) => found[m]).find((x) => x?.status === 'ok') : undefined;
          if (best) {
            adopted = true;
            use(best, keyToCheck);
          }
        });
    }
  }

  /** Switches to a working model; a key pasted in the panel is saved with it. */
  function use(result: KeyCheckResult | undefined, newKey = key || undefined) {
    if (!usable(result)) return;
    updateSettings({ provider, model: result.model });
    if (newKey && newKey !== apiKey) {
      saveKey(newKey, remember);
      setTyped('');
    }
    if (newKey || savedHere) setKeyResult(result);
    flashSaved();
  }

  function flashSaved() {
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2000);
  }

  const checkTyped = (k = key) => k && check(info.models, k, pastedId(k), { adopt: true });
  const checkAgain = () => activeId && check(shown?.models ?? info.models, key || (savedHere ? apiKey : undefined), activeId, { adopt: Boolean(key) });

  const source = savedHere
    ? `Your key ${maskKey(apiKey)}, pasted in this browser.`
    : envHere && env
      ? `Your key ${env.keyHint}, from server/.env.`
      : null;

  return (
    <Modal opened={opened} onClose={close} returnFocus={false} title={<Group gap={8}><IconKey size={18} stroke={1.6} /><Text fw={600}>Model & key</Text></Group>} size="md">
      <Stack gap="md">
        <Select
          label="Provider"
          data={PROVIDERS.map((p) => ({ value: p, label: `${PROVIDER_INFO[p].label}${envKeys.some((k) => k.provider === p) ? ' · key in server/.env' : ''}` }))}
          value={provider}
          onChange={(v) => {
            if (!v) return;
            run.current++;
            setProvider(v as ProviderId);
            setTyped('');
            setLive(null);
            // Choosing a provider whose key is in server/.env switches to that key, with its default model.
            if (!apiKey && envKeys.some((k) => k.provider === v) && v !== settings.provider) {
              updateSettings({ provider: v as ProviderId, model: '' });
              flashSaved();
            }
          }}
          allowDeselect={false}
        />

        <Stack gap={6}>
          {/* A plain masked field: no button to reveal the key. */}
          <TextInput
            type="password"
            label="API key"
            description={
              <>
                {source ? `${source} Paste another to replace it. ` : 'Get one at '}
                {!source && (
                  <Anchor href={info.keyUrl} target="_blank" rel="noreferrer" size="xs">
                    {new URL(info.keyUrl).host}
                  </Anchor>
                )}
                {!source && (provider === 'google' ? ' (free).' : '.')}
              </>
            }
            placeholder={source ? 'Paste a new key' : 'Paste your key'}
            value={typed}
            onChange={(e) => {
              run.current++;
              setTyped(e.currentTarget.value);
              setLive(null);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text').trim();
              if (!pasted) return;
              e.preventDefault();
              setTyped(pasted);
              checkTyped(pasted);
            }}
            onKeyDown={(e) => e.key === 'Enter' && checkTyped()}
            rightSection={
              key && !checking && !shown ? (
                <Button size="compact-xs" variant="light" onClick={() => checkTyped()}>
                  Check
                </Button>
              ) : null
            }
            rightSectionWidth={64}
            autoComplete="off"
            spellCheck={false}
          />
          {(key || savedHere) && (
            <Checkbox
              size="xs"
              label="Remember this key on this device"
              checked={remember}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setRemember(on);
                if (savedHere && !key) saveKey(apiKey, on);
              }}
            />
          )}
        </Stack>

        {rejection && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Key rejected">
            {rejection.message}
          </Alert>
        )}

        {activeId && !rejection && (
          <Stack gap={8}>
            <Group justify="space-between" gap="xs">
              <Group gap={8}>
                <Text size="sm" fw={500}>
                  Models
                </Text>
                {savedNote && (
                  <Group gap={4} c="teal" className="fade-in">
                    <IconCheck size={14} />
                    <Text size="xs">Saved</Text>
                  </Group>
                )}
              </Group>
              <Group gap={8}>
                {shown && !checking && (
                  <Text size="xs" c="dimmed">
                    checked {timeAgo(shown.checkedAt)}
                  </Text>
                )}
                <Button size="compact-xs" variant="subtle" leftSection={<IconRefresh size={13} />} onClick={checkAgain} loading={checking}>
                  {shown ? 'Check again' : 'Check models'}
                </Button>
              </Group>
            </Group>

            {shown ? (
              <Radio.Group value={inUse} onChange={(m) => use(shown.results[m])} label={<VisuallyHidden>Models</VisuallyHidden>}>
                <Stack gap={6}>
                  {shown.models.map((m) => (
                    <ModelRow key={m} model={m} result={shown.results[m]} isDefault={m === info.defaultModel} />
                  ))}
                </Stack>
              </Radio.Group>
            ) : (
              <Text size="sm" c="dimmed">
                Not checked yet. Check models to see which ones this key can use.
              </Text>
            )}

            {shown &&
              (extraOpen ? (
                <TextInput
                  size="xs"
                  placeholder="Another model id, e.g. gemini-3.5-pro"
                  value={extra}
                  onChange={(e) => setExtra(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !extra.trim()) return;
                    check([extra.trim()], key || (savedHere ? apiKey : undefined), activeId, { merge: true });
                    setExtra('');
                    setExtraOpen(false);
                  }}
                  autoFocus
                  spellCheck={false}
                />
              ) : (
                <Anchor component="button" size="xs" c="dimmed" onClick={() => setExtraOpen(true)} style={{ alignSelf: 'flex-start' }}>
                  + Another model id
                </Anchor>
              ))}
          </Stack>
        )}

        {requestError && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
            {requestError}
          </Alert>
        )}

        <Group justify="space-between">
          {apiKey ? (
            <Button
              variant="subtle"
              color="red"
              onClick={() => {
                storeCheck(`pasted:${settings.provider}:${maskKey(apiKey)}`, null);
                clearKey();
                setTyped('');
                setLive(null);
                const fallback = serverKeyFor(health, settings.provider);
                if (fallback) setProvider(fallback.provider);
              }}
            >
              Remove pasted key
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={close}>Done</Button>
        </Group>

        <Text size="xs" c="dimmed">
          Keys are never shown. A pasted key stays in this browser; a key in server/.env stays on the server. A check sends one tiny request to each
          model.
        </Text>
      </Stack>
    </Modal>
  );
}

function timeAgo(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const STATUS: Record<KeyCheckResult['status'], { color: string; label: (r: KeyCheckResult) => string }> = {
  ok: { color: 'teal', label: (r) => `Works · ${((r.latencyMs ?? 0) / 1000).toFixed(1)} s` },
  rate_limited: { color: 'yellow', label: (r) => (/quota/i.test(r.message) ? 'Quota used up' : 'Rate-limited now') },
  no_model_access: { color: 'gray', label: () => 'Not available' },
  invalid_key: { color: 'red', label: () => 'Key rejected' },
  unreachable: { color: 'red', label: () => 'No answer' },
  error: { color: 'red', label: () => 'Error' },
};

/** One model: its id, whether it is the default, and what the check found (the reason on hover). */
function ModelRow({ model, result, isDefault }: { model: string; result: KeyCheckResult | undefined; isDefault: boolean }) {
  const s = result && STATUS[result.status];
  const ok = usable(result);
  return (
    <Radio.Card value={model} disabled={!ok} radius="md" p="sm" title={result?.message} style={{ opacity: ok || !result ? 1 : 0.6 }}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
          <Radio.Indicator disabled={!ok} />
          <Text size="sm" fw={500} truncate>
            {model}
          </Text>
          {isDefault && (
            <Text size="xs" c="dimmed">
              default
            </Text>
          )}
        </Group>
        {result && s ? (
          <Badge variant="light" color={s.color} tt="none" style={{ flexShrink: 0 }}>
            {s.label(result)}
          </Badge>
        ) : (
          <Group gap={6} c="dimmed" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Loader size={12} />
            <Text size="xs">Checking</Text>
          </Group>
        )}
      </Group>
    </Radio.Card>
  );
}

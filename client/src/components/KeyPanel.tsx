import { useEffect, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Button, Checkbox, Group, Loader, Modal, PasswordInput, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconKey } from '@tabler/icons-react';
import { PROVIDER_INFO, PROVIDERS, type KeyCheckResult, type ProviderId } from '@wwa/shared';
import { api, ApiError } from '../lib/api';
import { clearKey, maskKey, saveKey, updateSettings, useSettings } from '../lib/settings';
import { setKeyResult, useAppStatus } from '../lib/status';

const usable = (r: KeyCheckResult | undefined): r is KeyCheckResult => r?.status === 'ok' || r?.status === 'rate_limited';

/**
 * "Model & key": pick a provider, paste a key, and check it against every model the provider offers
 * (one tiny request each, shown as each one answers). The models that work can be picked; the key and
 * the chosen model are saved in this browser and travel to the server only as headers on chat requests.
 * A pasted key is checked at once and, when it works, saved with the current model (or the first that
 * works), and the panel closes onto the chat input.
 */
export function KeyPanel({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { settings, apiKey } = useSettings();
  const { health } = useAppStatus();
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [key, setKey] = useState('');
  const [extra, setExtra] = useState('');
  const [remember, setRemember] = useState(settings.remember);
  /** The models being checked, in order, and each one's result once it arrives. */
  const [models, setModels] = useState<string[] | null>(null);
  const [results, setResults] = useState<Record<string, KeyCheckResult>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const run = useRef(0);
  const picked = useRef(false);

  useEffect(() => {
    if (!opened) return;
    setProvider(settings.provider);
    setRemember(settings.remember);
    setKey('');
    setExtra('');
    reset();
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = PROVIDER_INFO[provider];
  const savedHere = provider === settings.provider && Boolean(apiKey);
  const effectiveKey = key.trim() || (savedHere ? apiKey : '');
  const savedModel = settings.model || PROVIDER_INFO[settings.provider].defaultModel;
  const checking = Boolean(models && models.some((m) => !results[m]));
  // A rejected key is rejected for every model: say it once instead of on each row.
  const rejection = Object.values(results).find((r) => r.status === 'invalid_key');
  const choice = selected ? results[selected] : undefined;

  function reset() {
    run.current++;
    picked.current = false;
    setModels(null);
    setResults({});
    setSelected(null);
    setRequestError(null);
  }

  /** Checks every model. With `autoSave` (a pasted key), saves as soon as a good model is known. */
  function check(keyToCheck = effectiveKey, autoSave = false) {
    if (!keyToCheck) return;
    reset();
    const id = run.current;
    const list = [...new Set([...info.models, ...(extra.trim() ? [extra.trim()] : [])])];
    const current = savedHere ? savedModel : info.defaultModel;
    const found: Record<string, KeyCheckResult> = {};
    setModels(list);
    for (const model of list) {
      api
        .checkKey({ provider, key: keyToCheck, model })
        .catch((error): KeyCheckResult => ({ provider, model, status: 'error', message: error instanceof ApiError ? error.message : 'The check failed.' }))
        .then((r) => {
          if (run.current !== id) return;
          found[model] = r;
          setResults((prev) => ({ ...prev, [model]: r }));
          if (r.status === 'error' && /too many/i.test(r.message)) setRequestError(r.message);
          // Until the user picks: the current model if it works, otherwise the first one that does.
          if (!picked.current && r.status === 'ok') setSelected((s) => (s && s === current ? s : model === current || !s ? model : s));
          if (!autoSave || picked.current) return;
          // The current model works: done. Otherwise wait for all, then take the first that works.
          const done = list.every((m) => found[m]);
          const best = found[current]?.status === 'ok' ? found[current] : done ? list.map((m) => found[m]).find((x) => x.status === 'ok') : undefined;
          if (best) save(best, keyToCheck);
        });
    }
  }

  function save(result = choice, keyToSave = effectiveKey) {
    if (!usable(result)) return;
    run.current++; // ignore checks still on their way
    updateSettings({ provider, model: result.model });
    saveKey(keyToSave, remember);
    setKeyResult(result);
    onClose();
    // Straight to asking: the chat input, once the panel has closed and returned focus.
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 250);
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Group gap={8}><IconKey size={18} stroke={1.6} /><Text fw={600}>Model & key</Text></Group>} size="md">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {apiKey
            ? `Using your ${PROVIDER_INFO[settings.provider].label} key ${maskKey(apiKey)} with ${savedModel}.`
            : health?.serverKey
              ? 'Without your own key, the server key from server/.env answers.'
              : 'A key is needed to chat.'}
        </Text>

        <Select
          label="Provider"
          data={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_INFO[p].label }))}
          value={provider}
          onChange={(v) => {
            if (!v) return;
            setProvider(v as ProviderId);
            reset();
          }}
          allowDeselect={false}
        />

        <PasswordInput
          label="API key"
          placeholder={savedHere ? `Saved key ${maskKey(apiKey)}, paste to replace` : 'Paste your key'}
          value={key}
          onChange={(e) => {
            setKey(e.currentTarget.value);
            reset();
          }}
          onKeyDown={(e) => e.key === 'Enter' && void check()}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').trim();
            if (!pasted) return;
            e.preventDefault();
            setKey(pasted);
            check(pasted, true);
          }}
          autoComplete="off"
          spellCheck={false}
          description={
            <>
              Get one at{' '}
              <Anchor href={info.keyUrl} target="_blank" rel="noreferrer" size="xs">
                {new URL(info.keyUrl).host}
              </Anchor>
              {provider === 'google' ? ' (free).' : '.'}
            </>
          }
        />

        <TextInput
          label="Another model"
          placeholder="Optional model id, checked with the others"
          value={extra}
          onChange={(e) => setExtra(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void check()}
          spellCheck={false}
        />

        {rejection && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Key rejected">
            {rejection.message}
          </Alert>
        )}
        {models && !rejection && (
          <Radio.Group
            label="Models"
            description="Pick the model to answer with."
            value={selected}
            onChange={(v) => {
              picked.current = true;
              setSelected(v);
            }}
          >
            <Stack gap={6} mt={8}>
              {models.map((m) => (
                <ModelRow key={m} model={m} result={results[m]} isDefault={m === info.defaultModel} />
              ))}
            </Stack>
          </Radio.Group>
        )}
        {requestError && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
            {requestError}
          </Alert>
        )}

        <Checkbox label="Remember on this device" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} description="Off: the key is kept for this tab only." />

        <Group justify="space-between">
          {apiKey ? (
            <Button
              variant="subtle"
              color="red"
              onClick={() => {
                clearKey();
                reset();
              }}
            >
              Remove saved key
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant={models && !rejection ? 'default' : 'filled'} onClick={() => check()} loading={checking} disabled={!effectiveKey}>
              {models ? 'Check again' : 'Check models'}
            </Button>
            {models && !rejection && (
              <Button onClick={() => save()} disabled={!usable(choice)}>
                Save
              </Button>
            )}
          </Group>
        </Group>

        <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />} p="sm">
          <Text size="xs">
            Checking sends one tiny request to each model. Your key stays in this browser: it is sent to this app's server with each question, used
            for that answer, and never stored or logged.
          </Text>
        </Alert>
      </Stack>
    </Modal>
  );
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

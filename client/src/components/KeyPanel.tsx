import { useEffect, useState } from 'react';
import { Alert, Anchor, Autocomplete, Button, Checkbox, Group, Modal, PasswordInput, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconKey } from '@tabler/icons-react';
import { PROVIDER_INFO, PROVIDERS, type KeyCheckResult, type ProviderId } from '@wwa/shared';
import { api, ApiError } from '../lib/api';
import { clearKey, maskKey, saveKey, updateSettings, useSettings } from '../lib/settings';
import { setKeyResult, useAppStatus } from '../lib/status';

/**
 * "Model & key": pick a provider, paste a key, check it with one tiny request. The key stays in this
 * browser and travels to the server only as a header on chat requests.
 */
export function KeyPanel({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { settings, apiKey } = useSettings();
  const { health } = useAppStatus();
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(settings.remember);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<KeyCheckResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setProvider(settings.provider);
    setModel(settings.model);
    setRemember(settings.remember);
    setKey('');
    setResult(null);
    setRequestError(null);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = PROVIDER_INFO[provider];
  const effectiveKey = key.trim() || (provider === settings.provider ? apiKey : '');

  async function check() {
    if (!effectiveKey) return;
    setChecking(true);
    setResult(null);
    setRequestError(null);
    try {
      const r = await api.checkKey({ provider, key: effectiveKey, model: model.trim() || undefined });
      setResult(r);
      // A key that works (or only is rate-limited right now) is saved right away.
      if (r.status === 'ok' || r.status === 'rate_limited') {
        updateSettings({ provider, model: model.trim() });
        saveKey(effectiveKey, remember);
        setKeyResult(r);
        setKey('');
      }
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : 'The check failed. Try again.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Group gap={8}><IconKey size={18} stroke={1.6} /><Text fw={600}>Model & key</Text></Group>} size="md">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Use your own key from any of these providers.{' '}
          {health?.serverKey ? 'Without one, the demo key answers (limited per hour).' : 'A key is needed to chat.'}
        </Text>

        <Select
          label="Provider"
          data={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_INFO[p].label }))}
          value={provider}
          onChange={(v) => {
            if (!v) return;
            setProvider(v as ProviderId);
            setModel('');
            setResult(null);
          }}
          allowDeselect={false}
        />

        <PasswordInput
          label="API key"
          placeholder={provider === settings.provider && apiKey ? `Saved key ${maskKey(apiKey)}, paste to replace` : 'Paste your key'}
          value={key}
          onChange={(e) => setKey(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void check()}
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

        <Autocomplete
          label="Model"
          placeholder={info.defaultModel}
          data={info.models}
          value={model}
          onChange={setModel}
          description="Leave empty for the default. Any model id the provider offers works."
        />

        <Checkbox label="Remember on this device" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} description="Off: the key is kept for this tab only." />

        {result && <CheckResult result={result} />}
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
                clearKey();
                setResult(null);
              }}
            >
              Remove saved key
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
            <Button onClick={check} loading={checking} disabled={!effectiveKey}>
              Check and save
            </Button>
          </Group>
        </Group>

        <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />} p="sm">
          <Text size="xs">
            Your key stays in this browser. It is sent to this app's server with each question, used for that answer, and never stored or logged.
          </Text>
        </Alert>
      </Stack>
    </Modal>
  );
}

function CheckResult({ result }: { result: KeyCheckResult }) {
  const ok = result.status === 'ok';
  const warn = result.status === 'rate_limited';
  return (
    <Alert
      variant="light"
      color={ok ? 'teal' : warn ? 'yellow' : 'red'}
      icon={ok ? <IconCircleCheck size={18} /> : <IconAlertTriangle size={18} />}
      title={ok ? 'Key works' : warn ? 'Key works, but is rate-limited' : 'Key problem'}
    >
      {result.message}
      {(ok || warn) && ' Saved.'}
    </Alert>
  );
}

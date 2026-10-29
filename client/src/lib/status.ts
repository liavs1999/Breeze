import { useSyncExternalStore } from 'react';
import type { Health, KeyCheckResult } from '@wwa/shared';
import { api, withRetry } from './api';
import { getSettings } from './settings';

/**
 * What the header shows: whether the server is reachable, which key answers (yours or the demo key),
 * and whether your key works. A saved key is checked in the background on load.
 */
export interface AppStatus {
  health: Health | null;
  serverReachable: boolean;
  key: { state: 'none' | 'checking' | 'ok' | 'problem'; result?: KeyCheckResult };
}

let status: AppStatus = { health: null, serverReachable: true, key: { state: 'none' } };
const listeners = new Set<() => void>();
const set = (patch: Partial<AppStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};

export const useAppStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  );

export async function loadHealth(): Promise<void> {
  try {
    set({ health: await withRetry(api.health, 6), serverReachable: true });
  } catch {
    set({ serverReachable: false });
  }
}

let checkSeq = 0;
/** Checks the saved key (if any). Results from an older check never overwrite a newer one. */
export async function checkSavedKey(): Promise<KeyCheckResult | undefined> {
  const { settings, apiKey } = getSettings();
  const seq = ++checkSeq;
  if (!apiKey) {
    set({ key: { state: 'none' } });
    return undefined;
  }
  set({ key: { state: 'checking' } });
  try {
    const result = await api.checkKey({ provider: settings.provider, key: apiKey, model: settings.model || undefined });
    if (seq === checkSeq) set({ key: { state: result.status === 'ok' ? 'ok' : 'problem', result } });
    return result;
  } catch {
    if (seq === checkSeq) set({ key: { state: 'none' } });
    return undefined;
  }
}

export function setKeyResult(result: KeyCheckResult) {
  checkSeq++;
  set({ key: { state: result.status === 'ok' ? 'ok' : 'problem', result } });
}

export function markKeyProblem(message: string) {
  const prev = status.key.result;
  if (prev) set({ key: { state: 'problem', result: { ...prev, status: 'error', message } } });
}

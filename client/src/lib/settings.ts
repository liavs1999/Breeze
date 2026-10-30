import { useSyncExternalStore } from 'react';
import { CLIENT_HEADER, FAULT_HEADER, KEY_HEADERS, type Fault, type ProviderId, type UnitSystem } from '@breeze/shared';
import { clientId, read, readJson, write } from './storage';

/**
 * App settings, shared by every component. The API key is kept only in this browser: in local
 * storage when "remember on this device" is on, otherwise in session storage (this tab only).
 */
export interface Settings {
  units: UnitSystem;
  provider: ProviderId;
  model: string;
  remember: boolean;
  faults: Fault[];
}

const SETTINGS_KEY = 'breeze:settings';
const KEY_KEY = 'breeze:key';

const defaults: Settings = {
  units: guessUnits(),
  provider: 'google',
  model: '',
  remember: true,
  faults: [],
};

let settings: Settings = readJson(SETTINGS_KEY, defaults);
let apiKey: string = read(KEY_KEY, settings.remember ? 'local' : 'session') ?? '';
const listeners = new Set<() => void>();
let snapshot = { settings, apiKey };

function emit() {
  snapshot = { settings, apiKey };
  listeners.forEach((l) => l());
}

export function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  write(SETTINGS_KEY, JSON.stringify(settings));
  emit();
}

export function saveKey(key: string, remember: boolean): void {
  apiKey = key.trim();
  write(KEY_KEY, remember ? apiKey : null, 'local');
  write(KEY_KEY, remember ? null : apiKey, 'session');
  updateSettings({ remember });
}

export function clearKey(): void {
  apiKey = '';
  write(KEY_KEY, null, 'local');
  write(KEY_KEY, null, 'session');
  emit();
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snapshot,
  );
}

export const getSettings = () => snapshot;

/**
 * Request headers for the chat: this browser's id, the provider and model picked, the pasted key (if
 * any; otherwise the server uses its server/.env key for that provider) and the simulated faults.
 */
export function requestHeaders(): Record<string, string> {
  const { settings: s, apiKey: key } = snapshot;
  const headers: Record<string, string> = { [CLIENT_HEADER]: clientId(), [KEY_HEADERS.provider]: s.provider };
  if (key) headers[KEY_HEADERS.key] = key;
  if (s.model) headers[KEY_HEADERS.model] = s.model;
  if (s.faults.length) headers[FAULT_HEADER] = s.faults.join(',');
  return headers;
}

export const maskKey = (key: string) => (key ? `••••${key.slice(-4)}` : '');

/** °F only for a US locale in a US timezone (an en-US browser elsewhere still gets °C). */
function guessUnits(): UnitSystem {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    return region === 'US' && (tz.startsWith('America/') || tz === 'Pacific/Honolulu') ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

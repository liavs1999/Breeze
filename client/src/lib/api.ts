import { CLIENT_HEADER, type ChatSummary, type Health, type KeyCheckRequest, type KeyCheckResult } from '@breeze/shared';
import { clientId } from './storage';
import type { ChatMessage } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    const headers = { [CLIENT_HEADER]: clientId(), ...(init?.headers as Record<string, string> | undefined) };
    res = await fetch(path, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 15_000) });
  } catch {
    throw new ApiError('Cannot reach the server.', 'network', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.message ?? body?.error ?? `Request failed (${res.status})`, body?.error ?? 'error', res.status);
  return body as T;
}

/** Retries network failures and 5xx with backoff; used where a failure would leave a blank screen. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}

export interface LoadedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  streaming: boolean;
  /** Someone else's chat, opened by its link: it can be read and copied, not continued. */
  readOnly: boolean;
}

export const api = {
  health: () => request<Health>('/api/health'),
  chat: (id: string) => request<LoadedChat>(`/api/chats/${encodeURIComponent(id)}`),
  chats: () => request<ChatSummary[]>('/api/chats'),
  deleteChat: (id: string) => request<void>(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  stop: (id: string) => request<void>(`/api/chats/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  copyChat: (id: string, to: string) =>
    request<{ id: string }>(`/api/chats/${encodeURIComponent(id)}/copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    }),
  checkKey: (body: KeyCheckRequest) =>
    request<KeyCheckResult>('/api/keys/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    }),
};

/**
 * Chat errors arrive either as a JSON response ({ error, message }) or as stream error text
 * ("code|message"). Both become { code, message } for the UI.
 */
export function parseChatError(error: Error | undefined): { code: string; message: string } {
  const raw = error?.message ?? '';
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === 'object') return { code: body.error ?? 'error', message: body.message ?? 'Something went wrong.' };
  } catch {
    /* not JSON */
  }
  const sep = raw.indexOf('|');
  if (sep > 0 && sep < 24 && /^[a-z_]+$/.test(raw.slice(0, sep))) return { code: raw.slice(0, sep), message: raw.slice(sep + 1) };
  if (/fetch|network|terminated|load failed|connection|aborted|simulated/i.test(raw) || !raw) {
    return { code: 'network', message: 'The connection was interrupted.' };
  }
  return { code: 'error', message: raw };
}

/** Errors the user fixes in the key panel. */
export const KEY_ERRORS = new Set(['no_key', 'invalid_key', 'no_model_access']);

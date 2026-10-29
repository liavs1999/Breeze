import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { UIMessage } from 'ai';
import type { ChatSummary } from '@wwa/shared';
import { config } from './config';

/**
 * SQLite storage: chats (messages as JSON, one row per chat) and a cache of weather API responses that
 * survives restarts. node:sqlite is built into Node 22, so there is nothing native to compile.
 */
mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    messages TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    stored_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

export interface ChatRecord {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: string;
}

const getChatStmt = db.prepare('SELECT id, title, messages, updated_at FROM chats WHERE id = ?');
const upsertChatStmt = db.prepare(`
  INSERT INTO chats (id, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, messages = excluded.messages, updated_at = excluded.updated_at
`);

export function getChat(id: string): ChatRecord | null {
  const row = getChatStmt.get(id) as { id: string; title: string; messages: string; updated_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, title: row.title, messages: JSON.parse(row.messages), updatedAt: row.updated_at };
}

export function saveChat(id: string, messages: UIMessage[]): void {
  const now = new Date().toISOString();
  upsertChatStmt.run(id, titleOf(messages), JSON.stringify(messages), now, now);
}

export function listChats(limit = 20): ChatSummary[] {
  const rows = db
    .prepare('SELECT id, title, updated_at FROM chats ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as { id: string; title: string; updated_at: string }[];
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export function deleteChat(id: string): void {
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
}

function titleOf(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  const text = first?.parts.find((p) => p.type === 'text')?.text?.trim() ?? 'New chat';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

// ── Response cache ──────────────────────────────────────────────────────────────────────────────

const getCacheStmt = db.prepare('SELECT value, stored_at, expires_at FROM cache WHERE key = ?');
const putCacheStmt = db.prepare(
  'INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)',
);

export interface CachedValue<T> {
  value: T;
  storedAt: number;
  fresh: boolean;
}

/** Returns the cached value, fresh or not; callers decide whether stale data is acceptable. */
export function cacheGet<T>(key: string): CachedValue<T> | null {
  const row = getCacheStmt.get(key) as { value: string; stored_at: number; expires_at: number } | undefined;
  if (!row) return null;
  return { value: JSON.parse(row.value), storedAt: row.stored_at, fresh: row.expires_at > Date.now() };
}

export function cachePut(key: string, value: unknown, ttlMs: number): void {
  const now = Date.now();
  putCacheStmt.run(key, JSON.stringify(value), now, now + ttlMs);
}

/** Old cache rows are kept as a fallback for a week after expiry, then removed. */
export function pruneCache(): void {
  db.prepare('DELETE FROM cache WHERE expires_at < ?').run(Date.now() - 7 * 24 * 3600_000);
}

export function closeDb(): void {
  db.close();
}

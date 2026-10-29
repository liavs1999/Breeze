/** Browser storage that never throws (private windows, blocked storage) and falls back to memory. */
const memory = new Map<string, string>();

function area(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function read(key: string, kind: 'local' | 'session' = 'local'): string | null {
  try {
    return area(kind)?.getItem(key) ?? memory.get(`${kind}:${key}`) ?? null;
  } catch {
    return memory.get(`${kind}:${key}`) ?? null;
  }
}

export function write(key: string, value: string | null, kind: 'local' | 'session' = 'local'): void {
  const k = `${kind}:${key}`;
  if (value == null) memory.delete(k);
  else memory.set(k, value);
  try {
    if (value == null) area(kind)?.removeItem(key);
    else area(kind)?.setItem(key, value);
  } catch {
    /* memory copy is enough */
  }
}

export function readJson<T>(key: string, fallback: T, kind: 'local' | 'session' = 'local'): T {
  const raw = read(key, kind);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

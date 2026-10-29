/** A small sliding-window limiter, per visitor (IP). Enough for one server; Redis would back several. */
export function createLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit; returns false (and records nothing) when the visitor is over the limit. */
    take(visitor: string): { ok: boolean; retryAfterS: number } {
      const now = Date.now();
      const recent = (hits.get(visitor) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(visitor, recent);
        return { ok: false, retryAfterS: Math.ceil((recent[0] + windowMs - now) / 1000) };
      }
      recent.push(now);
      hits.set(visitor, recent);
      if (hits.size > 10_000) hits.clear();
      return { ok: true, retryAfterS: 0 };
    },
  };
}

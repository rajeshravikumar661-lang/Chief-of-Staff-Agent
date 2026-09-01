/**
 * Per-user fixed-window rate limiting (spec §9, §26).
 * In-memory by default; swap the store for Redis in production if needed.
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
): RateLimitResult {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt < now) {
    const resetAt = now + opts.windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }
  b.count += 1;
  const ok = b.count <= opts.limit;
  return { ok, remaining: Math.max(0, opts.limit - b.count), resetAt: b.resetAt };
}

export function rateLimitKey(userId: string, route: string): string {
  return `${userId}:${route}`;
}

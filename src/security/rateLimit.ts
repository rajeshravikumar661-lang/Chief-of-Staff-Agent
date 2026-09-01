/**
 * Per-user fixed-window rate limiting (spec §9, §26).
 *
 * Default store is a per-process in-memory map. When `UPSTASH_REDIS_REST_URL`
 * and `UPSTASH_REDIS_REST_TOKEN` are configured, a shared fixed-window counter
 * in Upstash Redis is used so the limit holds across serverless instances.
 *
 * The public API stays synchronous. The Redis path is best-effort: an INCR +
 * EXPIRE is issued fire-and-forget and its result is folded back into the local
 * bucket on the *next* call, so cross-instance traffic converges with one
 * request of lag. Any Redis error fails OPEN (request allowed) and is logged.
 */
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = env.upstashRedisUrl();
  const token = env.upstashRedisToken();
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

let loggedRedisError = false;
function logRedisError(err: unknown): void {
  if (loggedRedisError) return;
  loggedRedisError = true;
  console.error("[rateLimit] Redis unavailable, failing open to in-memory limiter", err);
}

/**
 * Fire-and-forget: increment the shared counter for this window and reconcile
 * the local bucket with the global count so subsequent local decisions account
 * for traffic served by other instances.
 */
function syncWithRedis(client: Redis, key: string, windowMs: number, resetAt: number): void {
  const redisKey = `rl:${key}:${resetAt}`;
  const ttlSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  void (async () => {
    try {
      const count = await client.incr(redisKey);
      if (count === 1) await client.expire(redisKey, ttlSeconds);
      const b = store.get(key);
      if (b && b.resetAt === resetAt && count > b.count) b.count = count;
    } catch (err) {
      logRedisError(err);
    }
  })();
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
): RateLimitResult {
  const now = Date.now();
  const client = getRedis();
  let b = store.get(key);

  if (!b || b.resetAt < now) {
    const resetAt = now + opts.windowMs;
    b = { count: 1, resetAt };
    store.set(key, b);
    if (client) syncWithRedis(client, key, opts.windowMs, resetAt);
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }

  b.count += 1;
  if (client) syncWithRedis(client, key, opts.windowMs, b.resetAt);
  const ok = b.count <= opts.limit;
  return { ok, remaining: Math.max(0, opts.limit - b.count), resetAt: b.resetAt };
}

export function rateLimitKey(userId: string, route: string): string {
  return `${userId}:${route}`;
}

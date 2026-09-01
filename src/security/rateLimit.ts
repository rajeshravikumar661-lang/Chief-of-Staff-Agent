/**
 * Per-user fixed-window rate limiting (spec §9, §26).
 *
 * Authoritative decision is always the synchronous per-process in-memory window.
 * When a shared store is configured it is used to fold cross-instance traffic
 * back into the local bucket (one request of lag), so a burst spread across
 * serverless instances still trips the limit.
 *
 * Shared store, in priority order:
 *   1. Upstash Redis REST — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. Plain Redis via ioredis — REDIS_URL (ignored when it points at localhost)
 *   3. none — in-memory only
 *
 * Every shared-store error fails OPEN (request allowed) and is logged once.
 */
import { Redis as UpstashRedis } from "@upstash/redis";
import type { Redis as IoRedis } from "ioredis";
import { env } from "@/lib/env";

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

// --- shared counter -------------------------------------------------------

interface SharedCounter {
  /** INCR the key, set EXPIRE on first hit; return the new global count. */
  bump(key: string, ttlSeconds: number): Promise<number>;
}

let counter: SharedCounter | null | undefined;

function makeCounter(): SharedCounter | null {
  const upstashUrl = env.upstashRedisUrl();
  const upstashToken = env.upstashRedisToken();
  if (upstashUrl && upstashToken) {
    const r = new UpstashRedis({ url: upstashUrl, token: upstashToken });
    return {
      async bump(key, ttl) {
        const n = await r.incr(key);
        if (n === 1) await r.expire(key, ttl);
        return n;
      },
    };
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && !/^redis:\/\/(localhost|127\.0\.0\.1)/.test(redisUrl)) {
    // Lazy-require ioredis so environments without it (or without REDIS_URL) don't load it.
    let client: IoRedis | null = null;
    const getClient = (): IoRedis => {
      if (!client) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const IoRedisCtor = require("ioredis") as typeof import("ioredis").default;
        client = new IoRedisCtor(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        client.on("error", () => {
          /* handled per-call via fail-open */
        });
      }
      return client;
    };
    return {
      async bump(key, ttl) {
        const c = getClient();
        const n = await c.incr(key);
        if (n === 1) await c.expire(key, ttl);
        return n;
      },
    };
  }

  return null;
}

function getCounter(): SharedCounter | null {
  if (counter === undefined) counter = makeCounter();
  return counter;
}

let loggedSharedError = false;
function logSharedError(err: unknown): void {
  if (loggedSharedError) return;
  loggedSharedError = true;
  console.error("[rateLimit] shared store unavailable — failing open to in-memory limiter", err);
}

function reconcile(c: SharedCounter, key: string, resetAt: number): void {
  const redisKey = `rl:${key}:${resetAt}`;
  const ttl = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  void (async () => {
    try {
      const global = await c.bump(redisKey, ttl);
      const b = store.get(key);
      if (b && b.resetAt === resetAt && global > b.count) b.count = global;
    } catch (err) {
      logSharedError(err);
    }
  })();
}

// --- public API ---------------------------------------------------------

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
): RateLimitResult {
  const now = Date.now();
  const c = getCounter();
  let b = store.get(key);

  if (!b || b.resetAt < now) {
    const resetAt = now + opts.windowMs;
    b = { count: 1, resetAt };
    store.set(key, b);
    if (c) reconcile(c, key, resetAt);
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }

  b.count += 1;
  if (c) reconcile(c, key, b.resetAt);
  const ok = b.count <= opts.limit;
  return { ok, remaining: Math.max(0, opts.limit - b.count), resetAt: b.resetAt };
}

export function rateLimitKey(userId: string, route: string): string {
  return `${userId}:${route}`;
}

/**
 * Agent memory store (spec §8).
 *
 * Three tiers, mirrored by `MemoryType` in the schema:
 *   - short_term : scratch context, expires ~1 day out
 *   - work       : facts about the current work / project, expires ~14 days out
 *   - long_term  : durable preferences and facts, never auto-expires
 *
 * All per-user reads/writes go through `scopedDb(userId)` so a missing `where`
 * clause can never leak across users (CLAUDE.md rule 5). `sweepExpired` may run
 * globally (cron) and then falls back to the bare `prisma` client.
 */
import { prisma, scopedDb } from "@/lib/db";

type MemoryTier = "short_term" | "long_term" | "work";

const MS_PER_DAY = 86_400_000;
const MIN_CONTENT_LENGTH = 3;

interface RememberInput {
  type: MemoryTier;
  content: string;
  source: string;
  confidence?: number;
  importance?: number;
  runId?: string;
  /** Explicit `null` keeps the memory forever; omitted uses the per-tier default. */
  expiresAt?: Date | null;
}

interface RecalledMemory {
  id: string;
  type: string;
  content: string;
  source: string;
  importance: number;
  createdAt: string;
}

function defaultExpiry(type: MemoryTier, now: Date): Date | null {
  if (type === "short_term") return new Date(now.getTime() + MS_PER_DAY);
  if (type === "work") return new Date(now.getTime() + 14 * MS_PER_DAY);
  return null; // long_term
}

/** Insert one memory. Silently skips content shorter than 3 (trimmed) chars. */
export async function remember(userId: string, m: RememberInput): Promise<void> {
  if (m.content.trim().length < MIN_CONTENT_LENGTH) return;

  const now = new Date();
  const expiresAt =
    m.expiresAt === undefined ? defaultExpiry(m.type, now) : m.expiresAt;

  await scopedDb(userId).memory.create({
    data: {
      userId,
      type: m.type,
      content: m.content,
      source: m.source,
      confidence: m.confidence,
      importance: m.importance,
      runId: m.runId,
      expiresAt,
    },
  });
}

/**
 * Read live (non-expired) memories, most important and most recent first.
 * `query` does a substring `contains` match on content; `limit` defaults to 20.
 */
export async function recall(
  userId: string,
  opts?: { type?: MemoryTier; query?: string; limit?: number },
): Promise<RecalledMemory[]> {
  const now = new Date();
  const limit = opts?.limit ?? 20;

  const where: Record<string, unknown> = {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  if (opts?.type) where.type = opts.type;
  if (opts?.query) where.content = { contains: opts.query };

  const rows = await scopedDb(userId).memory.findMany({
    where,
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    source: r.source,
    importance: r.importance,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Hard-delete every memory whose `expiresAt` is in the past. Scoped to one user
 * when `userId` is given, otherwise global. Returns the number of rows removed.
 */
export async function sweepExpired(userId?: string): Promise<number> {
  const where = { expiresAt: { lt: new Date() } };
  const result = userId
    ? await scopedDb(userId).memory.deleteMany({ where })
    : await prisma.memory.deleteMany({ where });
  return result.count;
}

/** Convenience: record a `work`-tier fact at importance 0.6. */
export async function noteWorkFact(
  userId: string,
  content: string,
  source: string,
): Promise<void> {
  await remember(userId, { type: "work", content, source, importance: 0.6 });
}

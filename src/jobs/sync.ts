/**
 * Per-user source sync (Gmail / Calendar / Drive) and the all-users fan-out the
 * scheduled `sync` job runs.
 *
 * Each connector is called independently via `Promise.allSettled` so one
 * failing/disconnected integration never blocks the others. A rejected source
 * contributes `0` to the returned counts and is logged.
 */
import { syncCalendar } from "@/integrations/calendar";
import { syncDrive } from "@/integrations/drive";
import { syncGmail } from "@/integrations/gmail";
import { markConnectionOk } from "@/integrations/google/auth";
import { syncSlack } from "@/integrations/slack";
import { syncGithub } from "@/integrations/github";
import { syncNotion } from "@/integrations/notion";
import { syncLinear } from "@/integrations/linear";
import { syncGworkspace } from "@/integrations/gworkspace";
import { prisma } from "@/lib/db";
import { syncPeople } from "@/jobs/relationships";
import { sweepOverdueCommitments } from "@/jobs/commitments";

export interface SyncCounts {
  gmail: number;
  calendar: number;
  drive: number;
  slack: number;
  github: number;
  notion: number;
  linear: number;
  gworkspace: number;
  people: number;
  commitmentsOverdue: number;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Best-effort coercion of a connector's return value into an item count.
 * Connectors may return a number, an array, or a `{ count | synced | imported }`
 * summary object — anything else counts as 0.
 */
function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["count", "synced", "imported", "created", "updated", "total"]) {
      const n = o[key];
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/** Cap each connector so one hung provider can't stall the whole sync (and the
 *  request that triggered it). */
function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} sync timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Sync every connected source for one user, then refresh derived data. Never throws. */
export async function syncAll(userId: string): Promise<SyncCounts> {
  const T = 25_000;
  const [gmail, calendar, drive, slack, github, notion, linear, gworkspace] =
    await Promise.allSettled([
      withTimeout(() => syncGmail(userId), T, "gmail"),
      withTimeout(() => syncCalendar(userId), T, "calendar"),
      withTimeout(() => syncDrive(userId), T, "drive"),
      withTimeout(() => syncSlack(userId), T, "slack"),
      withTimeout(() => syncGithub(userId), T, "github"),
      withTimeout(() => syncNotion(userId), T, "notion"),
      withTimeout(() => syncLinear(userId), T, "linear"),
      withTimeout(() => syncGworkspace(userId), T, "gworkspace"),
    ]);

  const resolve = (
    result: PromiseSettledResult<unknown>,
    label: string,
  ): number => {
    if (result.status === "fulfilled") return toCount(result.value);
    console.error(`[jobs/sync] ${label} sync failed for user ${userId}: ${errMsg(result.reason)}`);
    return 0;
  };

  // A Google connector that synced without throwing clears any stale "error"
  // flag left by a previous transient failure.
  await Promise.allSettled(
    ([["gmail", gmail], ["calendar", calendar], ["drive", drive]] as const)
      .filter(([, r]) => r.status === "fulfilled")
      .map(([p]) => markConnectionOk(userId, p)),
  );

  // Derived data depends on the freshly-synced messages/events.
  const [people, overdue] = await Promise.allSettled([
    syncPeople(userId),
    sweepOverdueCommitments(userId),
  ]);

  return {
    gmail: resolve(gmail, "gmail"),
    calendar: resolve(calendar, "calendar"),
    drive: resolve(drive, "drive"),
    slack: resolve(slack, "slack"),
    github: resolve(github, "github"),
    notion: resolve(notion, "notion"),
    linear: resolve(linear, "linear"),
    gworkspace: resolve(gworkspace, "gworkspace"),
    people: resolve(people, "people"),
    commitmentsOverdue: resolve(overdue, "commitments"),
  };
}

/** Sync every user in the system. Never throws — logs per-user failures. */
export async function syncAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  console.info(`[jobs/sync] syncing ${users.length} user(s)`);

  for (const { id } of users) {
    try {
      const counts = await syncAll(id);
      console.info(
        `[jobs/sync] user ${id} synced — gmail=${counts.gmail} calendar=${counts.calendar} drive=${counts.drive} people=${counts.people} overdue=${counts.commitmentsOverdue}`,
      );
    } catch (err) {
      console.error(`[jobs/sync] user ${id} sync errored: ${errMsg(err)}`);
    }
  }
}

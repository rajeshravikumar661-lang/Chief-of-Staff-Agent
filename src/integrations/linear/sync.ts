/**
 * Linear → `Task` sync (spec §7). Pulls the viewer's open assigned issues and
 * mirrors them into the per-user `Task` table: the user's existing
 * `source: "linear"` tasks are deleted and re-created from the current issue
 * list, then the `linear` `Connection.lastSyncAt` is stamped.
 *
 * Never throws — on any failure it returns the count synced so far (0 if it
 * failed before writing).
 */
import type { TaskStatus } from "@prisma/client";
import { prisma, scopedDb } from "@/lib/db";
import { myAssignedIssues, type LinearIssue } from "./client";

const MAX_TASKS = 50;

function mapStatus(stateType: string): TaskStatus {
  switch (stateType) {
    case "started":
      return "doing";
    case "unstarted":
    case "backlog":
    case "triage":
      return "todo";
    default:
      return "todo";
  }
}

function mapPriority(priority: number): string {
  switch (priority) {
    case 1:
      return "CRITICAL";
    case 2:
      return "HIGH";
    case 3:
      return "MEDIUM";
    default:
      // 4 (low) and 0 (none)
      return "LOW";
  }
}

function mapDeadline(dueDate: string | null): Date | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toTaskData(userId: string, issue: LinearIssue) {
  return {
    userId,
    title: `${issue.identifier} ${issue.title}`,
    status: mapStatus(issue.stateType),
    priority: mapPriority(issue.priority),
    deadline: mapDeadline(issue.dueDate),
    source: "linear",
  };
}

export async function syncLinear(userId: string): Promise<number> {
  try {
    const conn = await prisma.connection.findUnique({
      where: { userId_provider: { userId, provider: "linear" } },
    });
    if (!conn || !conn.accessTokenEncrypted) return 0;

    const issues = (await myAssignedIssues(userId)).slice(0, MAX_TASKS);

    const db = scopedDb(userId);
    await db.task.deleteMany({ where: { source: "linear" } });

    let synced = 0;
    for (const issue of issues) {
      try {
        await db.task.create({ data: toTaskData(userId, issue) });
        synced += 1;
      } catch (err) {
        console.error(
          `[linear/sync] skipped issue ${issue.identifier}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await db.connection.updateMany({
      where: { provider: "linear" },
      data: { lastSyncAt: new Date() },
    });

    return synced;
  } catch (err) {
    console.error(
      `[linear/sync] aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
}

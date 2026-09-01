/**
 * GitHub → `Task` sync (spec §7). Pulls the user's review-requested PRs and
 * assigned open issues and mirrors them into the per-user `Task` table.
 *
 * The `Task` table has no external-id unique key, so the sync is
 * delete-then-recreate: every existing `source: "github"` task for the user is
 * removed, then the current GitHub state is re-inserted (capped). The `github`
 * `Connection.lastSyncAt` is stamped afterwards.
 *
 * Never throws — a missing connection or any API failure resolves to `0`.
 */
import { scopedDb } from "@/lib/db";
import { ConnectionMissingError, listReviewRequests, listAssignedIssues } from "./client";

const MAX_TASKS = 40;

export async function syncGithub(userId: string): Promise<number> {
  const db = scopedDb(userId);

  let reviewRequests: Awaited<ReturnType<typeof listReviewRequests>>;
  let assignedIssues: Awaited<ReturnType<typeof listAssignedIssues>>;
  try {
    [reviewRequests, assignedIssues] = await Promise.all([
      listReviewRequests(userId),
      listAssignedIssues(userId),
    ]);
  } catch (err) {
    if (err instanceof ConnectionMissingError) return 0;
    console.error(
      `[github/sync] aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }

  const rows: { title: string; priority: string }[] = [];
  for (const pr of reviewRequests) {
    rows.push({
      title: `Review PR: ${pr.title} (${pr.repo}#${pr.number})`,
      priority: "HIGH",
    });
  }
  for (const issue of assignedIssues) {
    rows.push({
      title: `Issue: ${issue.title} (${issue.repo}#${issue.number})`,
      priority: "MEDIUM",
    });
  }
  const capped = rows.slice(0, MAX_TASKS);

  try {
    await db.task.deleteMany({ where: { source: "github" } });
    if (capped.length > 0) {
      await db.task.createMany({
        data: capped.map((r) => ({
          userId,
          title: r.title,
          priority: r.priority,
          status: "todo" as const,
          deadline: null,
          source: "github",
        })),
      });
    }
  } catch (err) {
    console.error(
      `[github/sync] task write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }

  try {
    await db.connection.updateMany({
      where: { provider: "github" },
      data: { lastSyncAt: new Date() },
    });
  } catch {
    // best-effort
  }

  return capped.length;
}

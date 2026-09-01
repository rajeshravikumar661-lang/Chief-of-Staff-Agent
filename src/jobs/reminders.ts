/**
 * Commitment reminders — surfaces open commitments that are overdue or come due
 * within the next 24 hours as `follow_up` briefing items. Runs every 6h.
 */
import { addDays, format, isBefore } from "date-fns";

import { prisma, scopedDb } from "@/lib/db";
import type { BriefingItem } from "@/lib/types";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Overdue / due-within-24h open commitments for one user, as briefing items. */
export async function runCommitmentReminders(userId: string): Promise<BriefingItem[]> {
  const db = scopedDb(userId);
  const now = new Date();
  const cutoff = addDays(now, 1);

  const commitments = await db.commitment.findMany({
    where: {
      status: { in: ["open", "overdue"] },
      deadline: { not: null, lte: cutoff },
    },
    orderBy: { deadline: "asc" },
  });

  return commitments.map((c): BriefingItem => {
    const deadline = c.deadline as Date; // filtered `not: null` above
    const overdue = isBefore(deadline, now);
    const when = format(deadline, "EEE MMM d, HH:mm");
    return {
      id: `commitment:${c.id}`,
      kind: "follow_up",
      title: overdue
        ? `Overdue: commitment to ${c.person}`
        : `Due within 24h: commitment to ${c.person}`,
      detail: `${c.description} — ${overdue ? "was due" : "due"} ${when} (source: ${c.source})`,
      priority: overdue ? "CRITICAL" : "HIGH",
      refUrl: c.sourceUrl ?? undefined,
      suggestedActions: [
        {
          id: `follow-up-${c.id}`,
          label: `Follow up with ${c.person}`,
          actionType: "DRAFT_REPLY",
          goal: `Follow up on my commitment to ${c.person}: ${c.description}`,
        },
      ],
    };
  });
}

/** Run commitment reminders for every user. Never throws. */
export async function runCommitmentRemindersAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  console.info(`[jobs/reminders] checking commitments for ${users.length} user(s)`);

  for (const { id } of users) {
    try {
      const items = await runCommitmentReminders(id);
      if (items.length > 0) {
        console.info(`[jobs/reminders] user ${id}: ${items.length} commitment reminder(s)`);
      }
    } catch (err) {
      console.error(`[jobs/reminders] user ${id} failed: ${errMsg(err)}`);
    }
  }
}

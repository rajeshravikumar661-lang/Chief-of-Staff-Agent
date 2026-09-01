/**
 * Commitment lifecycle housekeeping. Detection lives in
 * `src/agent/commitmentDetection.ts`; this flips `open` commitments whose
 * deadline has passed to `overdue` so the briefing / reminders / priority engine
 * see them correctly (spec §15).
 */
import { prisma, scopedDb } from "@/lib/db";

export async function sweepOverdueCommitments(userId: string): Promise<number> {
  const { count } = await scopedDb(userId).commitment.updateMany({
    where: { status: "open", deadline: { not: null, lt: new Date() } },
    data: { status: "overdue" },
  });
  return count;
}

export async function sweepOverdueCommitmentsAllUsers(): Promise<number> {
  const { count } = await prisma.commitment.updateMany({
    where: { status: "open", deadline: { not: null, lt: new Date() } },
    data: { status: "overdue" },
  });
  return count;
}

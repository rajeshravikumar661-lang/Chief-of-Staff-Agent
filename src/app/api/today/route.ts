import { auth } from "@/auth";
import { isResponse, ok, requireUser } from "@/lib/http";
import { prisma, scopedDb } from "@/lib/db";
import { listRunDTOs } from "@/agent/orchestrator";
import { scorePriority } from "@/agent/priorityEngine";
import { greetingFor, hhmm } from "@/app/api/_shared";
import { dayBoundsInTz, normalizeTz } from "@/lib/tz";
import type {
  AgendaItem,
  AgentRunSummaryDTO,
  FollowUpItem,
  NeedsAttentionItem,
  SuggestedAction,
  TodayResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser("today");
  if (isResponse(u)) return u;
  const { userId } = u;

  const db = scopedDb(userId);
  const [session, userRow] = await Promise.all([
    auth(),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  const tz = normalizeTz(userRow?.timezone);

  const now = new Date();
  const { start: startOfDay, end: endOfDay } = dayBoundsInTz(now, tz);

  let recentRuns: AgentRunSummaryDTO[] = [];
  const [events, unreadMessages, openCommitments] = await Promise.all([
    db.calendarEvent.findMany({
      where: { startTime: { gte: startOfDay, lte: endOfDay } },
      orderBy: { startTime: "asc" },
    }),
    db.message.findMany({
      where: { unread: true },
      orderBy: { timestamp: "desc" },
      take: 20,
    }),
    db.commitment.findMany({
      where: { status: { in: ["open", "overdue"] } },
      orderBy: [{ deadline: "asc" }, { detectedAt: "desc" }],
    }),
  ]);

  try {
    recentRuns = await listRunDTOs(userId, 5);
  } catch {
    recentRuns = [];
  }

  const agenda: AgendaItem[] = events.map((e) => ({
    time: hhmm(e.startTime, tz),
    title: e.title ?? "(untitled)",
    eventId: e.id,
    startsAt: e.startTime.toISOString(),
  }));

  const needsAttention: NeedsAttentionItem[] = [];

  const soonMeetings = events.filter(
    (e) =>
      e.startTime.getTime() >= now.getTime() &&
      e.startTime.getTime() - now.getTime() <= 3 * 60 * 60 * 1000,
  );
  for (const e of soonMeetings) {
    const mins = Math.max(1, Math.round((e.startTime.getTime() - now.getTime()) / 60000));
    needsAttention.push({
      id: `na_meeting_${e.id}`,
      text: `${e.title ?? "A meeting"} starts in ${mins} min`,
      priority: scorePriority({ urgency: 0.95, importance: 0.7, deadline: e.startTime }).bucket,
      refUrl: e.conferenceUrl ?? undefined,
    });
  }

  if (unreadMessages.length > 0) {
    needsAttention.push({
      id: "na_unread_messages",
      text: `${unreadMessages.length} unread message${
        unreadMessages.length === 1 ? "" : "s"
      } waiting for a response`,
      priority: scorePriority({ urgency: 0.6, importance: 0.6 }).bucket,
    });
  }

  const overdue = openCommitments.filter(
    (c) => c.status === "overdue" || (c.deadline != null && c.deadline.getTime() < now.getTime()),
  );
  for (const c of overdue.slice(0, 3)) {
    needsAttention.push({
      id: `na_commitment_${c.id}`,
      text: `Overdue commitment to ${c.person}: ${c.description}`,
      priority: scorePriority({
        urgency: 0.9,
        importance: 0.8,
        deadline: c.deadline,
        alreadyHandled: false,
      }).bucket,
      refUrl: c.sourceUrl ?? undefined,
    });
  }

  const followUps: FollowUpItem[] = openCommitments.slice(0, 10).map((c) => ({
    id: `fu_${c.id}`,
    text: `You owe ${c.person}: ${c.description}`,
    commitmentId: c.id,
  }));

  const suggestedActions: SuggestedAction[] = [];
  if (soonMeetings[0]) {
    const m = soonMeetings[0];
    suggestedActions.push({
      id: `sa_brief_${m.id}`,
      label: `Prepare briefing for ${m.title ?? "your next meeting"}`,
      actionType: "PREPARE_BRIEFING",
      goal: `Prepare me for my upcoming meeting "${m.title ?? ""}"`,
    });
  }
  if (unreadMessages.length > 0) {
    suggestedActions.push({
      id: "sa_draft_replies",
      label: "Draft replies to unread messages",
      actionType: "DRAFT_REPLY",
      goal: "Draft replies to my unread important messages",
    });
  }
  if (openCommitments[0]) {
    const c = openCommitments[0];
    suggestedActions.push({
      id: `sa_followup_${c.id}`,
      label: `Follow up with ${c.person}`,
      actionType: "SEND_FOLLOW_UP",
      goal: `Follow up with ${c.person} about: ${c.description}`,
    });
  }

  const body: TodayResponse = {
    greeting: greetingFor(session?.user?.name, tz),
    agenda,
    needsAttention: needsAttention.slice(0, 5),
    followUps,
    suggestedActions: suggestedActions.slice(0, 5),
    recentRuns,
  };
  return ok(body);
}

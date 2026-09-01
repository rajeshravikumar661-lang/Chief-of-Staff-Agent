/**
 * Morning Brief engine (product spec §13 pipeline + §14 priority engine).
 *
 * Pipeline for one user:
 *   1. gather candidate items from the user-scoped DB:
 *        - today's calendar events (important-meeting heuristic)
 *        - recent unanswered important emails (from a person, not a list)
 *        - open commitments due within 7 days or overdue
 *        - open tasks due within 3 days
 *   2. turn each candidate into a `PrioritySignal` and score it with
 *      `scorePriority()` (§14). A local fallback score keeps sorting sane if the
 *      engine throws or returns an unexpected shape.
 *   3. sort by score desc, keep the TOP 10 (§13).
 *   4. persist a `Briefing` row (items as JSON) and return a `BriefingResponse`.
 *
 * Everything read from the DB is DATA, never instructions (CLAUDE.md rule 2) —
 * it is only ever placed into `title` / `detail` strings, never executed.
 */
import type { Prisma } from "@prisma/client";
import {
  addDays,
  differenceInHours,
  endOfDay,
  format,
  isBefore,
  startOfDay,
  subDays,
} from "date-fns";

import { scorePriority } from "@/agent/priorityEngine";
import { assessReply } from "@/agent/emailSignal";
import type { PrioritySignal } from "@/agent/types";
import { prisma, scopedDb } from "@/lib/db";
import { sweepOverdueCommitments } from "@/jobs/commitments";
import type {
  BriefingItem,
  BriefingResponse,
  Priority,
  SuggestedAction,
} from "@/lib/types";

const MAX_ITEMS = 10;
const IMPORTANT_MEETING_RE = /investor|board|review|1:1|1-on-1|one[- ]on[- ]one|kickoff|all[- ]hands/i;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface Candidate {
  id: string;
  kind: BriefingItem["kind"];
  title: string;
  detail: string;
  refUrl?: string;
  signal: PrioritySignal;
  suggestedActions: SuggestedAction[];
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function isPriority(v: unknown): v is Priority {
  return v === "CRITICAL" || v === "HIGH" || v === "MEDIUM" || v === "LOW";
}

function bucketFromScore(n: number): Priority {
  if (n >= 2.6) return "CRITICAL";
  if (n >= 1.8) return "HIGH";
  if (n >= 1.0) return "MEDIUM";
  return "LOW";
}

/** Pure fallback score, used when `scorePriority()` is unavailable or odd. */
function localScore(s: PrioritySignal): number {
  let score =
    (s.urgency ?? 0) +
    (s.importance ?? 0) +
    (s.relationshipImportance ?? 0) * 0.5 +
    (s.userPreferenceWeight ?? 0);

  if (s.deadline) {
    const hrs = differenceInHours(new Date(s.deadline), new Date());
    if (hrs <= 0) score += 1;
    else if (hrs <= 24) score += 0.75;
    else if (hrs <= 72) score += 0.4;
    else if (hrs <= 168) score += 0.2;
  }
  if (s.alreadyHandled) score -= 0.5;
  return score;
}

interface Scored {
  score: number;
  bucket: Priority;
}

/** Normalize whatever `scorePriority()` returns into `{ score, bucket }`. */
function normalizeScore(raw: unknown, signal: PrioritySignal): Scored {
  const fallback = localScore(signal);

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { score: raw, bucket: bucketFromScore(raw) };
  }
  if (isPriority(raw)) {
    const byBucket: Record<Priority, number> = { LOW: 0.5, MEDIUM: 1.4, HIGH: 2.2, CRITICAL: 3 };
    return { score: byBucket[raw], bucket: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const num = [o.score, o.priorityScore, o.value, o.total].find(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    const bkt = [o.bucket, o.priority, o.label].find(isPriority);
    const score = num ?? fallback;
    return { score, bucket: bkt ?? bucketFromScore(score) };
  }
  return { score: fallback, bucket: bucketFromScore(fallback) };
}

async function scoreCandidate(c: Candidate): Promise<Scored> {
  try {
    const raw = await Promise.resolve(scorePriority(c.signal));
    return normalizeScore(raw, c.signal);
  } catch (err) {
    console.error(`[jobs/morningBriefing] scorePriority failed for ${c.id}: ${errMsg(err)}`);
    return normalizeScore(undefined, c.signal);
  }
}

// ---------------------------------------------------------------------------
// Candidate gathering
// ---------------------------------------------------------------------------

function attendeeCount(attendees: unknown): number {
  return Array.isArray(attendees) ? attendees.length : 0;
}

function senderName(sender: string | null): string {
  if (!sender) return "someone";
  const m = sender.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m ? m[1] : sender.replace(/<[^>]+>/, "")).trim() || sender;
}

function fmt(d: Date): string {
  return format(d, "EEE MMM d, HH:mm");
}

type Db = ReturnType<typeof scopedDb>;

async function meetingCandidates(db: Db, now: Date): Promise<Candidate[]> {
  try {
    const events = await db.calendarEvent.findMany({
      where: { startTime: { gte: startOfDay(now), lte: endOfDay(now) } },
      orderBy: { startTime: "asc" },
      take: 25,
    });
    return events.map((ev): Candidate => {
      const title = ev.title?.trim() || "Untitled meeting";
      const count = attendeeCount(ev.attendees);
      const important = count >= 2 || IMPORTANT_MEETING_RE.test(title);
      const hrs = differenceInHours(ev.startTime, now);
      const urgency = hrs <= 2 ? 0.95 : hrs <= 8 ? 0.8 : 0.6;
      return {
        id: `meeting:${ev.id}`,
        kind: "meeting",
        title,
        detail: `${fmt(ev.startTime)} · ${count} attendee(s)${ev.location ? ` · ${ev.location}` : ""}${
          important ? " · flagged important" : ""
        }`,
        refUrl: ev.conferenceUrl ?? undefined,
        signal: {
          urgency,
          importance: important ? 0.9 : 0.5,
          deadline: ev.startTime,
          relationshipImportance: important ? 0.8 : 0.5,
        },
        suggestedActions: [
          {
            id: `prepare-briefing-${ev.id}`,
            label: `Prepare briefing for ${title}`,
            actionType: "PREPARE_BRIEFING",
            goal: `Prepare me for ${title}`,
          },
        ],
      };
    });
  } catch (err) {
    console.error(`[jobs/morningBriefing] meeting query failed: ${errMsg(err)}`);
    return [];
  }
}

async function emailCandidates(db: Db, now: Date): Promise<Candidate[]> {
  try {
    const messages = await db.message.findMany({
      where: { unread: true, timestamp: { gte: subDays(now, 3) } },
      orderBy: { timestamp: "desc" },
      take: 60,
    });
    return messages
      .map((m) => ({ m, reply: assessReply(m) }))
      .filter(({ reply }) => reply.needsReply)
      .sort((a, b) => b.reply.score - a.reply.score)
      .slice(0, 10)
      .map(({ m, reply }): Candidate => {
        const who = senderName(m.sender);
        const subject = m.subject?.trim() || "(no subject)";
        const ageHrs = differenceInHours(now, m.timestamp);
        return {
          id: `email:${m.id}`,
          kind: "email",
          title: `Reply needed: ${subject}`,
          detail: `From ${who} · ${fmt(m.timestamp)} · ${reply.reasons.join(", ")}${m.snippet ? ` · ${m.snippet.slice(0, 120)}` : ""}`,
          refUrl:
            m.provider === "gmail" && m.threadId
              ? `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`
              : undefined,
          signal: {
            urgency: ageHrs <= 24 ? 0.7 : 0.5,
            importance: 0.4 + reply.score * 0.5,
            relationshipImportance: reply.score,
            deadline: null,
          },
          suggestedActions: [
            {
              id: `draft-reply-${m.id}`,
              label: `Draft reply to ${who}`,
              actionType: "DRAFT_REPLY",
              goal: `Draft a reply to the email "${subject}" from ${who}`,
            },
          ],
        };
      });
  } catch (err) {
    console.error(`[jobs/morningBriefing] email query failed: ${errMsg(err)}`);
    return [];
  }
}

async function commitmentCandidates(db: Db, now: Date): Promise<Candidate[]> {
  try {
    const commitments = await db.commitment.findMany({
      where: {
        status: { in: ["open", "overdue"] },
        deadline: { not: null, lte: addDays(now, 7) },
      },
      orderBy: { deadline: "asc" },
      take: 25,
    });
    return commitments.map((c): Candidate => {
      const deadline = c.deadline as Date; // filtered `not: null` above
      const overdue = isBefore(deadline, now);
      return {
        id: `commitment:${c.id}`,
        kind: "commitment",
        title: overdue
          ? `Overdue commitment to ${c.person}`
          : `Commitment to ${c.person} due soon`,
        detail: `${c.description} — ${overdue ? "was due" : "due"} ${fmt(deadline)} (source: ${c.source})`,
        refUrl: c.sourceUrl ?? undefined,
        signal: {
          urgency: overdue ? 0.95 : 0.75,
          importance: 0.7,
          relationshipImportance: 0.7,
          // overdue -> deadline is "now" (fully elapsed proximity)
          deadline: overdue ? now : deadline,
        },
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
  } catch (err) {
    console.error(`[jobs/morningBriefing] commitment query failed: ${errMsg(err)}`);
    return [];
  }
}

const TASK_IMPORTANCE: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
};

async function taskCandidates(db: Db, now: Date): Promise<Candidate[]> {
  try {
    const tasks = await db.task.findMany({
      where: {
        status: { in: ["todo", "doing"] },
        deadline: { not: null, lte: addDays(now, 3) },
      },
      orderBy: { deadline: "asc" },
      take: 25,
    });
    return tasks.map((t): Candidate => {
      const deadline = t.deadline as Date;
      const overdue = isBefore(deadline, now);
      return {
        id: `task:${t.id}`,
        kind: "task",
        title: t.title,
        detail: `${overdue ? "Overdue" : "Due"} ${fmt(deadline)}${t.source ? ` · ${t.source}` : ""}`,
        signal: {
          urgency: overdue ? 0.9 : 0.7,
          importance: TASK_IMPORTANCE[t.priority] ?? 0.5,
          deadline: overdue ? now : deadline,
        },
        suggestedActions: [
          {
            id: `plan-task-${t.id}`,
            label: `Plan: ${t.title}`,
            actionType: "PLAN_TASK",
            goal: `Help me make progress on the task: ${t.title}`,
          },
        ],
      };
    });
  } catch (err) {
    console.error(`[jobs/morningBriefing] task query failed: ${errMsg(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build, persist and return today's briefing for one user. */
export async function generateBriefing(userId: string): Promise<BriefingResponse> {
  const db = scopedDb(userId);
  const now = new Date();

  // Keep commitment status accurate before we rank anything off it.
  await sweepOverdueCommitments(userId).catch((e) =>
    console.error(`[jobs/morningBriefing] overdue sweep failed for ${userId}:`, e),
  );

  const candidates = (
    await Promise.all([
      meetingCandidates(db, now),
      emailCandidates(db, now),
      commitmentCandidates(db, now),
      taskCandidates(db, now),
    ])
  ).flat();

  const scored = await Promise.all(
    candidates.map(async (c) => ({ c, ...(await scoreCandidate(c)) })),
  );
  scored.sort((a, b) => b.score - a.score);

  const items: BriefingItem[] = scored.slice(0, MAX_ITEMS).map(({ c, bucket }) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    detail: c.detail,
    priority: bucket,
    refUrl: c.refUrl,
    suggestedActions: c.suggestedActions,
  }));

  const generatedAt = now.toISOString();

  try {
    await db.briefing.create({
      data: {
        userId,
        generatedAt: now,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // A persistence failure must not lose the computed briefing for the caller.
    console.error(`[jobs/morningBriefing] persist failed for user ${userId}: ${errMsg(err)}`);
  }

  console.info(`[jobs/morningBriefing] user ${userId}: ${items.length} item(s) from ${candidates.length} candidate(s)`);
  return { generatedAt, items };
}

/** Generate briefings for every user. Never throws — logs per-user failures. */
export async function generateBriefingsForAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  console.info(`[jobs/morningBriefing] generating for ${users.length} user(s)`);

  for (const { id } of users) {
    try {
      await generateBriefing(id);
    } catch (err) {
      console.error(`[jobs/morningBriefing] user ${id} failed: ${errMsg(err)}`);
    }
  }
}

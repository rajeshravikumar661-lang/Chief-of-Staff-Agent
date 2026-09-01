/**
 * Relationship intelligence (spec §16): derive `Person` rows from synced
 * messages and calendar events so `GET /api/people/:id` and the briefing have a
 * populated contact graph. Idempotent — safe to re-run every sync.
 */
import { prisma, scopedDb } from "@/lib/db";

const NON_HUMAN =
  /(no-?reply|do-?not-?reply|notifications?@|mailer-daemon|postmaster|bounce|automated|newsletter|updates?@|support@|billing@)/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function extractEmails(value: string | null | undefined): string[] {
  if (!value) return [];
  return (value.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || email;
}

/** Rebuild/refresh the Person graph for one user. Returns rows upserted. */
export async function syncPeople(userId: string): Promise<number> {
  const db = scopedDb(userId);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const self = new Set(me?.email ? [me.email.toLowerCase()] : []);

  const seen = new Map<string, { name: string; lastContactAt: Date | null }>();
  const note = (email: string, name: string, when: Date | null) => {
    if (!email || self.has(email) || NON_HUMAN.test(email)) return;
    const prev = seen.get(email);
    const lastContactAt =
      when && (!prev?.lastContactAt || when > prev.lastContactAt) ? when : prev?.lastContactAt ?? when;
    seen.set(email, { name: prev?.name ?? name, lastContactAt: lastContactAt ?? null });
  };

  const messages = await db.message.findMany({
    orderBy: { timestamp: "desc" },
    take: 500,
    select: { sender: true, recipients: true, timestamp: true },
  });
  for (const m of messages) {
    for (const e of extractEmails(m.sender)) note(e, nameFromEmail(e), m.timestamp);
    for (const r of m.recipients) for (const e of extractEmails(r)) note(e, nameFromEmail(e), m.timestamp);
  }

  const events = await db.calendarEvent.findMany({
    orderBy: { startTime: "desc" },
    take: 300,
    select: { attendees: true, startTime: true },
  });
  for (const ev of events) {
    const list = Array.isArray(ev.attendees) ? (ev.attendees as unknown[]) : [];
    for (const a of list) {
      const email = typeof a === "string" ? a : (a as { email?: string })?.email;
      for (const e of extractEmails(email)) note(e, nameFromEmail(e), ev.startTime);
    }
  }

  let count = 0;
  for (const [email, info] of seen) {
    await db.person.upsert({
      where: { userId_email: { userId, email } },
      create: { userId, email, name: info.name, lastContactAt: info.lastContactAt },
      update: {
        lastContactAt: info.lastContactAt ?? undefined,
        // don't clobber a name a human/LLM may have refined
      },
    });
    count += 1;
  }
  return count;
}

export async function syncPeopleAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of users) {
    try {
      await syncPeople(id);
    } catch (err) {
      console.error(`[jobs/relationships] user ${id} failed:`, err);
    }
  }
}

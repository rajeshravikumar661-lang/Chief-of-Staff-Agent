import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const CAP = 10;

export async function GET(request: Request) {
  const u = await requireUser("search");
  if (isResponse(u)) return u;
  const { userId } = u;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return err("VALIDATION_ERROR", "Query must be at least 2 characters", 400);
  }

  const db = scopedDb(userId);
  const ci = { contains: q, mode: "insensitive" as const };

  const [messages, documents, events, people] = await Promise.all([
    db.message.findMany({
      where: { OR: [{ subject: ci }, { body: ci }] },
      orderBy: { timestamp: "desc" },
      take: CAP,
    }),
    db.document.findMany({
      where: { OR: [{ title: ci }, { content: ci }] },
      orderBy: { updatedAt: "desc" },
      take: CAP,
    }),
    db.calendarEvent.findMany({
      where: { title: ci },
      orderBy: { startTime: "desc" },
      take: CAP,
    }),
    db.person.findMany({
      where: { OR: [{ name: ci }, { email: ci }] },
      take: CAP,
    }),
  ]);

  const body: SearchResponse = {
    messages: messages.map((m) => ({
      id: m.id,
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      timestamp: m.timestamp.toISOString(),
    })),
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title ?? null,
      url: d.url ?? null,
      snippet: d.content ? d.content.replace(/\s+/g, " ").trim().slice(0, 200) : null,
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title ?? null,
      startTime: e.startTime.toISOString(),
    })),
    people: people.map((p) => ({ id: p.id, name: p.name, email: p.email ?? null })),
  };

  return ok(body);
}

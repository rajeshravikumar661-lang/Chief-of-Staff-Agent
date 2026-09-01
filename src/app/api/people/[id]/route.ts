import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { commitmentToDTO, hhmm } from "@/app/api/_shared";
import type { AgendaItem, PersonDTO, Priority } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("people/detail");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id } = await params;
  const db = scopedDb(userId);

  const person = await db.person.findFirst({ where: { id } });
  if (!person) return err("NOT_FOUND", "Person not found", 404);

  const now = new Date();
  const email = person.email ?? null;
  const nameNeedle = person.name.trim();

  const personMatch: Record<string, unknown>[] = [
    { person: { contains: nameNeedle, mode: "insensitive" } },
  ];
  if (email) personMatch.push({ person: { contains: email, mode: "insensitive" } });

  const [openCommitments, upcomingEvents, messages] = await Promise.all([
    db.commitment.findMany({
      where: { status: "open", OR: personMatch },
      orderBy: [{ deadline: "asc" }, { detectedAt: "desc" }],
      take: 50,
    }),
    db.calendarEvent.findMany({
      where: { startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 100,
    }),
    db.message.findMany({
      where: email
        ? { OR: [{ sender: { contains: email, mode: "insensitive" } }, { recipients: { has: email } }] }
        : { sender: { contains: nameNeedle, mode: "insensitive" } },
      orderBy: { timestamp: "desc" },
      take: 10,
    }),
  ]);

  const emailLc = email?.toLowerCase();
  const upcomingMeetings: AgendaItem[] = upcomingEvents
    .filter((e) => {
      const hay = JSON.stringify(e.attendees ?? "").toLowerCase();
      return (emailLc && hay.includes(emailLc)) || hay.includes(nameNeedle.toLowerCase());
    })
    .slice(0, 10)
    .map((e) => ({ time: hhmm(e.startTime), title: e.title ?? "(untitled)", eventId: e.id }));

  const dto: PersonDTO = {
    id: person.id,
    name: person.name,
    email: person.email ?? null,
    org: person.org ?? null,
    importance: (person.importance as Priority) ?? "MEDIUM",
    lastContactAt: person.lastContactAt ? person.lastContactAt.toISOString() : null,
    openCommitments: openCommitments.map(commitmentToDTO),
    upcomingMeetings,
    recentMessages: messages.map((m) => ({
      id: m.id,
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      timestamp: m.timestamp.toISOString(),
    })),
    documents: [],
  };

  return ok(dto);
}

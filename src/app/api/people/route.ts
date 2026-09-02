import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import type { PeopleListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const u = await requireUser("people");
  if (isResponse(u)) return u;
  const { userId } = u;

  const sp = new URL(request.url).searchParams;

  const limitRaw = Number(sp.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  const q = (sp.get("q") ?? "").trim();
  const ci = { contains: q, mode: "insensitive" as const };

  const db = scopedDb(userId);

  const people = await db.person.findMany({
    where: q.length >= 2 ? { OR: [{ name: ci }, { email: ci }] } : {},
    orderBy: [{ lastContactAt: "desc" }],
    take: limit,
  });

  const body: PeopleListResponse = {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? null,
      org: p.org ?? null,
      importance: p.importance,
      lastContactAt: p.lastContactAt ? p.lastContactAt.toISOString() : null,
    })),
  };

  return ok(body);
}

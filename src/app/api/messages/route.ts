import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import type { MessagesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const u = await requireUser("messages");
  if (isResponse(u)) return u;
  const { userId } = u;

  const sp = new URL(request.url).searchParams;

  const filterParam = sp.get("filter") ?? "all";
  const filter = filterParam === "email" || filterParam === "whatsapp" ? filterParam : "all";

  const limitRaw = Number(sp.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  const q = (sp.get("q") ?? "").trim();
  const ci = { contains: q, mode: "insensitive" as const };

  const db = scopedDb(userId);

  const messages = await db.message.findMany({
    where: {
      ...(filter === "email" ? { provider: "gmail" } : {}),
      ...(filter === "whatsapp" ? { provider: "whatsapp" } : {}),
      ...(q.length >= 2 ? { OR: [{ subject: ci }, { body: ci }] } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  const body: MessagesResponse = {
    messages: messages.map((m) => ({
      id: m.id,
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      sender: m.sender ?? null,
      provider: m.provider,
      unread: m.unread,
      timestamp: m.timestamp.toISOString(),
    })),
  };

  return ok(body);
}

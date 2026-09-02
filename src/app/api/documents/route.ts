import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import type { DocumentsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const u = await requireUser("documents");
  if (isResponse(u)) return u;
  const { userId } = u;

  const sp = new URL(request.url).searchParams;

  const limitRaw = Number(sp.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  const q = (sp.get("q") ?? "").trim();
  const ci = { contains: q, mode: "insensitive" as const };

  const db = scopedDb(userId);

  const documents = await db.document.findMany({
    where: q.length >= 2 ? { OR: [{ title: ci }, { content: ci }] } : {},
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const body: DocumentsResponse = {
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title ?? null,
      url: d.url ?? null,
      provider: d.provider,
      snippet: d.content ? d.content.replace(/\s+/g, " ").trim().slice(0, 200) : null,
      updatedAt: d.updatedAt.toISOString(),
    })),
  };

  return ok(body);
}

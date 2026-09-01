import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { generateBriefing } from "@/jobs/morningBriefing";
import type { BriefingItem, BriefingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser("briefing/today");
  if (isResponse(u)) return u;
  const { userId } = u;

  const db = scopedDb(userId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await db.briefing.findFirst({
    where: { generatedAt: { gte: startOfDay } },
    orderBy: { generatedAt: "desc" },
  });

  if (existing) {
    const body: BriefingResponse = {
      generatedAt: existing.generatedAt.toISOString(),
      items: (existing.items ?? []) as unknown as BriefingItem[],
    };
    return ok(body);
  }

  const generated = await generateBriefing(userId);
  return ok(generated);
}

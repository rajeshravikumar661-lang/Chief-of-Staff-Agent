import { isResponse, ok, requireUser } from "@/lib/http";
import { generateBriefing } from "@/jobs/morningBriefing";

export const dynamic = "force-dynamic";

export async function POST() {
  const u = await requireUser("briefing/generate");
  if (isResponse(u)) return u;
  const { userId } = u;

  const briefing = await generateBriefing(userId);
  return ok(briefing);
}

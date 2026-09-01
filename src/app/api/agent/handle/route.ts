import { z } from "zod";
import { ok, err, requireUser, isResponse } from "@/lib/http";
import { handleThis } from "@/agent/flagship";
import type { HandleResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ subject: z.string().min(2).max(300) });

/** POST /api/agent/handle — the flagship "Handle everything related to X" flow. */
export async function POST(request: Request) {
  const u = await requireUser("agent/handle", { limit: 20, windowMs: 60_000 });
  if (isResponse(u)) return u;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const result: HandleResponse = await handleThis(u.userId, parsed.data.subject);
  return ok(result, { status: 201 });
}

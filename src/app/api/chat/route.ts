import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { handleChat } from "@/agent/chat";
import type { ChatResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
  conversationId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const u = await requireUser("chat");
  if (isResponse(u)) return u;
  const { userId } = u;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const result: ChatResponse = await handleChat(
    userId,
    parsed.data.message,
    parsed.data.conversationId,
  );

  return ok(result);
}

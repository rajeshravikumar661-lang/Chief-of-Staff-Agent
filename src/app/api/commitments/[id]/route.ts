import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { commitmentToDTO } from "@/app/api/_shared";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    status: z.enum(["open", "done", "cancelled", "overdue"]).optional(),
    deadline: z.string().datetime().nullable().optional(),
    description: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("commitments/update");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = scopedDb(userId);
  const existing = await db.commitment.findFirst({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Commitment not found", 404);

  const data: {
    status?: "open" | "done" | "cancelled" | "overdue";
    deadline?: Date | null;
    description?: string;
  } = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.deadline !== undefined) {
    data.deadline = parsed.data.deadline === null ? null : new Date(parsed.data.deadline);
  }

  const updated = await db.commitment.update({ where: { id }, data });
  return ok(commitmentToDTO(updated));
}

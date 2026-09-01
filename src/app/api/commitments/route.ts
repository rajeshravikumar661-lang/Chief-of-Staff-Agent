import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { commitmentToDTO } from "@/app/api/_shared";
import type { CommitmentDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["open", "done", "cancelled", "overdue"]);

export async function GET(request: Request) {
  const u = await requireUser("commitments");
  if (isResponse(u)) return u;
  const { userId } = u;

  const statusParam = new URL(request.url).searchParams.get("status");
  let where: { status?: z.infer<typeof statusSchema> } = {};
  if (statusParam) {
    const parsed = statusSchema.safeParse(statusParam);
    if (!parsed.success) return err("VALIDATION_ERROR", `Invalid status: ${statusParam}`, 400);
    where = { status: parsed.data };
  }

  const db = scopedDb(userId);
  const rows = await db.commitment.findMany({
    where,
    orderBy: [{ deadline: "asc" }, { detectedAt: "desc" }],
  });

  const dtos: CommitmentDTO[] = rows.map(commitmentToDTO);
  return ok(dtos);
}

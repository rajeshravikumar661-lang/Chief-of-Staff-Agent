import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { taskToDTO } from "@/app/api/_shared";
import type { TaskDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["todo", "doing", "done"]);

export async function GET(request: Request) {
  const u = await requireUser("tasks");
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
  const rows = await db.task.findMany({
    where,
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
  });

  const dtos: TaskDTO[] = rows.map(taskToDTO);
  return ok(dtos);
}

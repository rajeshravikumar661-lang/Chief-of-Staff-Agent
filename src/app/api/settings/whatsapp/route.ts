import { z } from "zod";
import { ok, err, requireUser, isResponse } from "@/lib/http";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  number: z.string().min(6).max(20), // digits, optionally with + / spaces
  digestHour: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  const u = await requireUser("settings/whatsapp");
  if (isResponse(u)) return u;
  const row = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { whatsappJid: true, digestHour: true },
  });
  return ok({ number: row?.whatsappJid ?? null, digestHour: row?.digestHour ?? null });
}

export async function PUT(request: Request) {
  const u = await requireUser("settings/whatsapp");
  if (isResponse(u)) return u;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  const digits = parsed.data.number.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15 || /x/i.test(parsed.data.number)) {
    return err("VALIDATION_ERROR", "Enter a real number: country code + number, digits only", 400);
  }
  await prisma.user.update({
    where: { id: u.userId },
    data: { whatsappJid: digits, digestHour: parsed.data.digestHour ?? null },
  });
  return ok({ number: digits, digestHour: parsed.data.digestHour ?? null });
}

export async function DELETE() {
  const u = await requireUser("settings/whatsapp");
  if (isResponse(u)) return u;
  await prisma.user.update({ where: { id: u.userId }, data: { whatsappJid: null } });
  return ok({ number: null });
}

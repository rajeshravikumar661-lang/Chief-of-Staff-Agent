import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";
import { DEFAULT_TZ } from "@/lib/tz";
import type { ProfileDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const putSchema = z.object({
  timezone: z
    .string()
    .min(1)
    .refine(isValidTimezone, { message: "Invalid IANA timezone" })
    .optional(),
  digestHour: z.number().int().min(0).max(23).nullable().optional(),
});

function toDTO(u: {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  timezone: string | null;
  digestHour: number | null;
}): ProfileDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    timezone: u.timezone && isValidTimezone(u.timezone) ? u.timezone : DEFAULT_TZ,
    digestHour: u.digestHour,
  };
}

const SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  timezone: true,
  digestHour: true,
} as const;

export async function GET() {
  const u = await requireUser("settings-profile");
  if (isResponse(u)) return u;

  const row = await prisma.user.findUnique({ where: { id: u.userId }, select: SELECT });
  if (!row) return err("NOT_FOUND", "User not found", 404);

  return ok<ProfileDTO>(toDTO(row));
}

export async function PUT(request: Request) {
  const u = await requireUser("settings-profile");
  if (isResponse(u)) return u;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const data: { timezone?: string; digestHour?: number | null } = {};
  if (parsed.data.timezone !== undefined) data.timezone = parsed.data.timezone;
  if (parsed.data.digestHour !== undefined) data.digestHour = parsed.data.digestHour;

  const row = await prisma.user.update({
    where: { id: u.userId },
    data,
    select: SELECT,
  });

  return ok<ProfileDTO>(toDTO(row));
}

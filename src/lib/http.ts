import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit, rateLimitKey } from "@/security/rateLimit";
import type { ApiError } from "@/lib/types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function err(code: string, message: string, status = 400) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

/**
 * Resolve the signed-in user for a route handler, applying a per-user rate limit.
 * Returns either `{ userId }` or a ready-to-return error Response.
 */
export async function requireUser(
  route: string,
  limit = { limit: 120, windowMs: 60_000 },
): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return err("UNAUTHENTICATED", "Sign in required", 401);

  const rl = rateLimit(rateLimitKey(userId, route), limit);
  if (!rl.ok) return err("RATE_LIMITED", "Too many requests", 429);

  return { userId };
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

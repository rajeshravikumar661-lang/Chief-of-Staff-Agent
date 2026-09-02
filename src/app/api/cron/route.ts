/**
 * External-cron entrypoint. A scheduler (GitHub Actions, cron-job.org, …) hits
 * this every few minutes; it runs `runTick()` (WhatsApp keep-alive + digest +
 * event reminders) and, as a side effect, keeps the Render web service warm so
 * the WhatsApp sockets stay alive. Replaces the BullMQ worker, which Render's
 * free tier can't run. See DEPLOY.md.
 */
import { NextResponse } from "next/server";

import { runTick } from "@/jobs/tick";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = env.cronSecret();
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      new URL(req.url).searchParams.get("key") ||
      req.headers.get("x-cron-key");
    if (provided !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runTick();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;

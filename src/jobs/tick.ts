/**
 * The periodic "tick" — everything the (now retired) BullMQ worker used to do,
 * driven instead by an external cron hitting /api/cron. Safe to call as often as
 * every few minutes; every unit is idempotent.
 */
import { connectUser, isLinked, isWhatsAppEnabled } from "@/integrations/whatsapp/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hourInTz, normalizeTz } from "@/lib/tz";
import { runEventRemindersAllUsers } from "@/jobs/eventReminders";
import { sendWhatsAppDigest } from "@/jobs/whatsappDigest";

export interface TickResult {
  whatsappReconnected: number;
  digestsSent: number;
  reminderUsers: number;
  errors: string[];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** "YYYY-MM-DD" for instant `d` as seen in IANA zone `tz`. */
function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function runTick(): Promise<TickResult> {
  const result: TickResult = {
    whatsappReconnected: 0,
    digestsSent: 0,
    reminderUsers: 0,
    errors: [],
  };
  const now = new Date();

  // 1. WhatsApp keep-alive — reconnect any dead per-user socket so inbound
  //    messages keep being handled and the digest send path stays warm.
  //    `connectUser` is a no-op when the socket is already open.
  try {
    if (isWhatsAppEnabled()) {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const { id } of users) {
        try {
          if (await isLinked(id)) {
            await connectUser(id);
            result.whatsappReconnected++;
          }
        } catch (err) {
          console.error(`[tick] whatsapp keep-alive failed for ${id}:`, errMsg(err));
        }
      }
    }
  } catch (err) {
    result.errors.push(`whatsapp-keepalive: ${errMsg(err)}`);
  }

  // 2. Daily digest — send once per user per local calendar day, at their
  //    `digestHour` (falling back to BRIEFING_HOUR). The WhatsAppDigestLog row
  //    is the dedupe key so re-ticking within the same hour is harmless.
  try {
    if (isWhatsAppEnabled()) {
      const users = await prisma.user.findMany({
        select: { id: true, digestHour: true, timezone: true },
      });
      for (const u of users) {
        try {
          const tz = normalizeTz(u.timezone);
          const hour = hourInTz(now, tz);
          const targetHour = u.digestHour ?? env.digestDefaultHour();
          if (hour !== targetHour) continue;

          const dayKey = dayKeyInTz(now, tz);
          const already = await prisma.whatsAppDigestLog.findUnique({
            where: { userId_sentOn: { userId: u.id, sentOn: dayKey } },
          });
          if (already) continue;

          const r = await sendWhatsAppDigest(u.id);
          if (r.sent) {
            try {
              await prisma.whatsAppDigestLog.create({
                data: { userId: u.id, sentOn: dayKey },
              });
            } catch {
              // Unique-constraint race — a concurrent tick already logged it. Fine.
            }
            result.digestsSent++;
          }
        } catch (err) {
          console.error(`[tick] digest failed for ${u.id}:`, errMsg(err));
        }
      }
    }
  } catch (err) {
    result.errors.push(`digest: ${errMsg(err)}`);
  }

  // 3. Calendar event reminders (day-before / hour-before) for every user.
  try {
    await runEventRemindersAllUsers();
    const users = await prisma.user.findMany({ select: { id: true } });
    result.reminderUsers = users.length;
  } catch (err) {
    result.errors.push(`event-reminders: ${errMsg(err)}`);
  }

  return result;
}

let started = false;

/** Fire runTick() on an interval while this process is alive. Best-effort backup
 *  to the external cron (dies on Render spin-down, which is fine). Guarded so it
 *  only ever starts one interval. */
export function startTickInterval(): void {
  if (started) return;
  started = true;
  // Don't run one immediately — avoid a burst of work during a deploy.
  const handle = setInterval(() => {
    runTick().catch((e) => console.error("[tick] interval error", e));
  }, 10 * 60 * 1000);
  handle.unref?.();
}

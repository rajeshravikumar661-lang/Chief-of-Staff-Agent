/**
 * Registers the repeatable BullMQ jobs:
 *   - `sync`                  every 30 minutes
 *   - `morning-briefing`      daily at BRIEFING_HOUR:BRIEFING_MINUTE (cron)
 *   - `commitment-reminders`  every 6 hours
 *
 * No-op (with a log line) when Redis is not configured.
 */
import { env } from "@/lib/env";

import { makeQueue, redisConfigured } from "./queue";

const EVERY_30_MIN = 30 * 60 * 1000;
const EVERY_6_HOURS = 6 * 60 * 60 * 1000;

export async function registerSchedules(): Promise<void> {
  if (!redisConfigured) {
    console.warn("[jobs/scheduler] REDIS_URL not set — skipping repeatable job registration");
    return;
  }

  const hour = env.briefingHour();
  const minute = env.briefingMinute();
  const briefingCron = `${minute} ${hour} * * *`;

  const commonOpts = { removeOnComplete: true, removeOnFail: 100 } as const;

  const syncQueue = makeQueue("sync");
  const briefingQueue = makeQueue("morning-briefing");
  const remindersQueue = makeQueue("commitment-reminders");
  const whatsappQueue = makeQueue("whatsapp-digest");

  try {
    await syncQueue.add(
      "sync-all-users",
      {},
      { jobId: "repeat:sync", repeat: { every: EVERY_30_MIN }, ...commonOpts },
    );
    await briefingQueue.add(
      "briefing-all-users",
      {},
      { jobId: "repeat:morning-briefing", repeat: { pattern: briefingCron }, ...commonOpts },
    );
    await remindersQueue.add(
      "reminders-all-users",
      {},
      { jobId: "repeat:commitment-reminders", repeat: { every: EVERY_6_HOURS }, ...commonOpts },
    );
    if (process.env.WHATSAPP_ENABLED === "true") {
      await whatsappQueue.add(
        "whatsapp-digest-all-users",
        {},
        { jobId: "repeat:whatsapp-digest", repeat: { pattern: briefingCron }, ...commonOpts },
      );
    }

    console.info(
      `[jobs/scheduler] repeatable jobs registered — sync=30m, morning-briefing='${briefingCron}', commitment-reminders=6h${
        process.env.WHATSAPP_ENABLED === "true" ? `, whatsapp-digest='${briefingCron}'` : ""
      }`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[jobs/scheduler] failed to register repeatable jobs: ${msg}`);
  }
}

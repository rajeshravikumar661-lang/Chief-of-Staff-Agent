/**
 * Standalone background-worker entrypoint: `tsx src/jobs/worker.ts`
 * (also `npm run worker`).
 *
 * Starts one worker per queue — `sync`, `morning-briefing`,
 * `commitment-reminders` — each delegating to its all-users function, registers
 * the repeatable schedules, then stays alive until SIGINT / SIGTERM.
 */
import { generateBriefingsForAllUsers } from "./morningBriefing";
import { makeWorker, redisConfigured } from "./queue";
import { runCommitmentRemindersAllUsers } from "./reminders";
import { registerSchedules } from "./scheduler";
import { syncAllUsers } from "./sync";
import { sendWhatsAppDigestAllUsers } from "./whatsappDigest";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function main(): Promise<void> {
  if (!redisConfigured) {
    console.warn(
      "[jobs/worker] REDIS_URL not set — worker is starting but cannot process jobs until Redis is configured",
    );
  }

  const workers = [
    makeWorker("sync", async () => {
      await syncAllUsers();
    }),
    makeWorker("morning-briefing", async () => {
      await generateBriefingsForAllUsers();
    }),
    makeWorker("commitment-reminders", async () => {
      await runCommitmentRemindersAllUsers();
    }),
    makeWorker("whatsapp-digest", async () => {
      await sendWhatsAppDigestAllUsers();
    }),
  ];

  for (const w of workers) {
    w.on("completed", (job) => console.info(`[jobs/worker] ${w.name}: job ${job.id} completed`));
    w.on("failed", (job, err) =>
      console.error(`[jobs/worker] ${w.name}: job ${job?.id} failed: ${errMsg(err)}`),
    );
    w.on("error", (err) => console.error(`[jobs/worker] ${w.name}: worker error: ${errMsg(err)}`));
  }

  await registerSchedules();
  console.info("[jobs/worker] up — workers: sync, morning-briefing, commitment-reminders");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[jobs/worker] ${signal} received — shutting down`);
    await Promise.allSettled(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[jobs/worker] fatal: ${errMsg(err)}`);
  process.exit(1);
});

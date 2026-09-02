/**
 * Next.js server-start hook. On a warm process (local dev, a persistent host)
 * this starts the in-process `startTickInterval()` as a best-effort backup to
 * the external cron that drives `/api/cron`. It dies on Render free-tier
 * spin-down, which is fine — the external cron is the real driver.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTickInterval } = await import("@/jobs/tick");
    startTickInterval();
  }
}

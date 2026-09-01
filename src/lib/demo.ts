/**
 * Demo mode — lets the frontend be viewed and clicked through with zero
 * backend (no Postgres, no Google OAuth). Gated so it can never leak into a
 * real deployment:
 *
 *  1. `NEXT_PUBLIC_DEMO_MODE` must be the literal string "true".
 *  2. `NODE_ENV` must be "development" (i.e. `next dev`, never `next build`
 *     / `next start`). `next build` always sets NODE_ENV=production
 *     regardless of what's in .env*, and NEXT_PUBLIC_* values are inlined
 *     into the compiled bundle at build time — so a production build
 *     literally cannot contain a live demo-mode branch, even if the env var
 *     is set on the machine that runs `next start`.
 *
 * Never read `process.env.NEXT_PUBLIC_DEMO_MODE` anywhere else — always go
 * through `DEMO_MODE` from this module so the guard is applied exactly once,
 * everywhere.
 */
export const DEMO_MODE =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Small artificial latency so demo interactions feel like real network calls, not a mock. */
export function demoDelay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

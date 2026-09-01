/**
 * Priority engine (spec §14).
 *
 * PURE and synchronous — no I/O, no async, no DB. Every input comes in via
 * `PrioritySignal`; the only ambient dependency is the wall clock, read once per
 * `scorePriority` call so deadline proximity can be derived.
 */
import type { PrioritySignal } from "@/agent/types";
import type { Priority } from "@/lib/types";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Threshold logic, shared by `scorePriority` and any caller that already has a score. */
export function bucketOf(score: number): Priority {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.55) return "HIGH";
  if (score >= 0.3) return "MEDIUM";
  return "LOW";
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Missing / non-finite numeric fields default to 0. */
function numeric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Derive a 0..1 deadline-proximity weight from `signal.deadline`:
 *   overdue or < 6h  -> 1.0
 *   later today       -> 0.8
 *   <= 2 days         -> 0.6
 *   <= 7 days         -> 0.35
 *   further out       -> 0.1
 *   null / unparsable -> 0
 */
function deadlineProximity(
  deadline: string | Date | null | undefined,
  now: Date,
): number {
  if (deadline === null || deadline === undefined) return 0;
  const when = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(when.getTime())) return 0;

  const deltaMs = when.getTime() - now.getTime();
  if (deltaMs < 6 * MS_PER_HOUR) return 1.0; // overdue or imminent
  if (isSameCalendarDay(when, now)) return 0.8;
  if (deltaMs <= 2 * MS_PER_DAY) return 0.6;
  if (deltaMs <= 7 * MS_PER_DAY) return 0.35;
  return 0.1;
}

/**
 * score = 0.30*urgency + 0.30*importance + 0.20*deadlineProximity
 *       + 0.15*relationshipImportance + 0.10*clamp(userPreferenceWeight,0,1)
 *       - (alreadyHandled ? 0.5 : 0)
 * clamped to [0,1].
 */
export function scorePriority(signal: PrioritySignal): {
  score: number;
  bucket: Priority;
} {
  const now = new Date();

  const urgency = numeric(signal.urgency);
  const importance = numeric(signal.importance);
  const proximity = deadlineProximity(signal.deadline, now);
  const relationshipImportance = numeric(signal.relationshipImportance);
  const preference = clamp(numeric(signal.userPreferenceWeight), 0, 1);
  const handledPenalty = signal.alreadyHandled ? 0.5 : 0;

  const raw =
    0.3 * urgency +
    0.3 * importance +
    0.2 * proximity +
    0.15 * relationshipImportance +
    0.1 * preference -
    handledPenalty;

  const score = clamp(raw, 0, 1);
  return { score, bucket: bucketOf(score) };
}

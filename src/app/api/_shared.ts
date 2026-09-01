/**
 * Shared serializers/helpers for API route handlers.
 * Not a route file (underscore prefix) — Next.js App Router ignores it.
 */
import type { Commitment, Task } from "@prisma/client";
import type { CommitmentDTO, Priority, TaskDTO } from "@/lib/types";
import { formatTime, greeting } from "@/lib/tz";

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** "HH:MM" for instant `d`. When `tz` is given, renders in that IANA zone. */
export function hhmm(d: Date, tz?: string | null): string {
  if (tz != null) return formatTime(d, tz);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function greetingFor(name?: string | null, tz?: string | null): string {
  const part =
    tz != null
      ? greeting(new Date(), tz)
      : (() => {
          const h = new Date().getHours();
          return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
        })();
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export function commitmentToDTO(c: Commitment): CommitmentDTO {
  return {
    id: c.id,
    person: c.person,
    description: c.description,
    deadline: iso(c.deadline),
    source: c.source,
    sourceUrl: c.sourceUrl ?? null,
    status: c.status as CommitmentDTO["status"],
    confidence: c.confidence,
    detectedAt: c.detectedAt.toISOString(),
  };
}

export function taskToDTO(t: Task): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskDTO["status"],
    priority: (t.priority as Priority) ?? "MEDIUM",
    deadline: iso(t.deadline),
    source: t.source ?? null,
  };
}

export const GOOGLE_PROVIDERS = ["gmail", "calendar", "drive", "gworkspace"] as const;
export const OAUTH_M6_PROVIDERS = ["slack", "github", "notion", "linear"] as const;
export const ALL_PROVIDERS = [
  "gmail",
  "calendar",
  "drive",
  "gworkspace",
  "slack",
  "github",
  "notion",
  "linear",
] as const;
export type KnownProvider = (typeof ALL_PROVIDERS)[number];

export function isKnownProvider(p: string): p is KnownProvider {
  return (ALL_PROVIDERS as readonly string[]).includes(p);
}

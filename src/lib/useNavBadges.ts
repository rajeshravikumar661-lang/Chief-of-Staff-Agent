"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

/**
 * Small, best-effort unread/pending counts for the primary nav. Failures are
 * swallowed — a badge is a nice-to-have, never worth breaking navigation
 * over. Polls gently since these live in a persistent chrome, not a page.
 */
export function useNavBadges() {
  const { data: overdueCommitments } = useSWR(
    "nav-badge-commitments-overdue",
    () => api.commitments("overdue"),
    { refreshInterval: 60_000, shouldRetryOnError: false },
  );
  const { data: runs } = useSWR("nav-badge-runs", () => api.listRuns(), {
    refreshInterval: 60_000,
    shouldRetryOnError: false,
  });

  const awaitingApproval = runs?.filter((r) => r.status === "awaiting_approval").length ?? 0;

  return {
    planner: overdueCommitments?.length ?? 0,
    activity: awaitingApproval,
  };
}

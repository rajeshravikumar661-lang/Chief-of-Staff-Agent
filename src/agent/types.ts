import type { Permission } from "@/agent/tools/types";

/** Output of the Context Retriever (spec §7). */
export interface RetrievedSnippet {
  source: string; // "gmail" | "calendar" | "drive" | "slack" | "commitment" | ...
  text: string;
  ref?: string; // external id / url for citations
  score?: number;
  timestamp?: string;
}
export interface RetrievedContext {
  entities: string[];
  timeframe: { from: string; to: string };
  snippets: RetrievedSnippet[];
  summary: string;
}

/** A single planned step before execution (spec §6, §21). */
export interface PlannedStep {
  index: number;
  title: string;
  tool: string | null; // null = a reasoning-only step
  permission: Permission;
  arguments: unknown;
}

/** Compact tool description handed to the planner. */
export interface ToolCatalogEntry {
  name: string;
  description: string;
  permission: Permission;
}

/** Priority engine input (spec §14). */
export interface PrioritySignal {
  urgency?: number; // 0..1
  importance?: number; // 0..1
  deadline?: string | Date | null;
  relationshipImportance?: number; // 0..1
  userPreferenceWeight?: number; // -1..1
  alreadyHandled?: boolean;
}

/** Commitment extracted from text (spec §15). */
export interface CommitmentDraft {
  person: string;
  description: string;
  deadline: string | null;
  source: string;
  sourceUrl?: string | null;
  confidence: number;
}

export function wrapRetrieved(source: string, text: string): string {
  return `<retrieved_content source="${source}">\n${text}\n</retrieved_content>`;
}

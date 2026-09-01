import type { AgentRun, AgentStep } from "@prisma/client";
import type {
  AgentRunDTO,
  AgentRunSummaryDTO,
  AgentStepDTO,
  PermissionLevel,
  RunStatusDTO,
  StepStatusDTO,
} from "@/lib/types";

export function stepToDTO(s: AgentStep): AgentStepDTO {
  return {
    id: s.id,
    index: s.index,
    tool: s.tool,
    title: s.title,
    permission: (s.permission as PermissionLevel) ?? "READ",
    status: s.status as StepStatusDTO,
    requiresApproval: s.requiresApproval,
    summary: s.summary,
    arguments: s.arguments ?? undefined,
    result: s.result ?? undefined,
    verification: (s.verification as { verified: boolean; detail: string } | null) ?? null,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
  };
}

export function runToDTO(run: AgentRun & { steps: AgentStep[] }): AgentRunDTO {
  return {
    id: run.id,
    goal: run.goal,
    status: run.status as RunStatusDTO,
    summary: run.summary,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    steps: [...run.steps].sort((a, b) => a.index - b.index).map(stepToDTO),
  };
}

export function runToSummaryDTO(run: AgentRun & { _count?: { steps: number }; steps?: AgentStep[] }): AgentRunSummaryDTO {
  return {
    id: run.id,
    goal: run.goal,
    status: run.status as RunStatusDTO,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    stepCount: run._count?.steps ?? run.steps?.length ?? 0,
  };
}

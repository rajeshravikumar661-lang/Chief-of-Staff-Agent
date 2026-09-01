/**
 * Demo API — mirrors the exact public shape of src/lib/api.ts,
 * but backs everything with demoStore instead of fetch.
 */

import { demoDelay } from "@/lib/demo";
import { demoStore } from "@/lib/demoStore";
import type {
  AgentRunDTO,
  AgentRunSummaryDTO,
  BriefingResponse,
  ChatResponse,
  CommitmentDTO,
  ConnectionDTO,
  PersonDTO,
  SearchResponse,
  TaskDTO,
  TodayResponse,
} from "@/lib/types";

export const demoApi = {
  async me(): Promise<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }> {
    await demoDelay();
    return {
      id: "demo-user",
      name: "Mohin (Demo)",
      email: "demo@example.com",
      image: null,
    };
  },

  async today(): Promise<TodayResponse> {
    await demoDelay();
    return demoStore.getToday();
  },

  async connections(): Promise<ConnectionDTO[]> {
    await demoDelay();
    return demoStore.listConnections();
  },

  async connect(provider: string): Promise<{ redirectUrl: string }> {
    await demoDelay();
    demoStore.connectProvider(provider);
    return { redirectUrl: "/connections" };
  },

  async disconnect(provider: string): Promise<{ ok: true }> {
    await demoDelay();
    demoStore.disconnectProvider(provider);
    return { ok: true };
  },

  async chat(
    message: string,
    conversationId?: string
  ): Promise<ChatResponse> {
    await demoDelay();

    const lowerMessage = message.toLowerCase();
    let reply: string;
    let runId: string | undefined;

    // If the message suggests a task, create a run
    if (
      lowerMessage.includes("handle") ||
      lowerMessage.includes("prepare") ||
      lowerMessage.includes("draft") ||
      lowerMessage.includes("follow up")
    ) {
      const result = demoStore.createRun(message);
      runId = result.runId;
      reply = "On it — I'll handle that now.";
    } else if (
      lowerMessage.includes("important") ||
      lowerMessage.includes("today") ||
      lowerMessage.includes("acme")
    ) {
      reply =
        "Looking at your day: You have the Acme investor meeting at 11:00 today, and Alex's pricing proposal needs your feedback by EOD. You also have 3 unread messages. Anything specific you'd like me to focus on?";
    } else {
      reply =
        "Here's what I found — nothing urgent beyond what's already on your Today page. Your main focus for today is the Acme investor call at 11:00.";
    }

    return {
      reply,
      runId,
      conversationId: conversationId || "demo-conversation",
    };
  },

  async createRun(goal: string): Promise<{ runId: string }> {
    await demoDelay();
    return demoStore.createRun(goal);
  },

  async listRuns(): Promise<AgentRunSummaryDTO[]> {
    await demoDelay();
    return demoStore.listRuns();
  },

  async getRun(id: string): Promise<AgentRunDTO> {
    await demoDelay();
    const run = demoStore.getRun(id);
    if (!run) {
      throw new Error(`Run ${id} not found`);
    }
    return run;
  },

  async cancelRun(id: string): Promise<{ ok: true }> {
    await demoDelay();
    return demoStore.cancelRun(id);
  },

  async approveStep(runId: string, stepId: string): Promise<AgentRunDTO> {
    await demoDelay();
    return demoStore.approveStep(runId, stepId);
  },

  async rejectStep(runId: string, stepId: string): Promise<AgentRunDTO> {
    await demoDelay();
    return demoStore.rejectStep(runId, stepId);
  },

  runStreamUrl(_id: string): string {
    // In demo mode, the SSE hook branches around this anyway
    return "";
  },

  async commitments(status?: string): Promise<CommitmentDTO[]> {
    await demoDelay();
    return demoStore.listCommitments(status);
  },

  async updateCommitment(
    id: string,
    patch: { status?: string; deadline?: string | null; description?: string }
  ): Promise<CommitmentDTO> {
    await demoDelay();
    return demoStore.updateCommitment(id, patch);
  },

  async person(id: string): Promise<PersonDTO> {
    await demoDelay();
    return demoStore.getPerson(id);
  },

  async tasks(status?: string): Promise<TaskDTO[]> {
    await demoDelay();
    return demoStore.listTasks(status);
  },

  async briefingToday(): Promise<BriefingResponse> {
    await demoDelay();
    return demoStore.getBriefing();
  },

  async briefingGenerate(): Promise<BriefingResponse> {
    await demoDelay();
    return demoStore.regenerateBriefing();
  },

  async search(q: string): Promise<SearchResponse> {
    await demoDelay();
    return demoStore.search(q);
  },

  async auditLogs(
    runId?: string
  ): Promise<
    {
      id: string;
      action: string;
      tool: string | null;
      runId: string | null;
      stepId: string | null;
      result: unknown;
      timestamp: string;
    }[]
  > {
    await demoDelay();
    return demoStore.listAuditLogs(runId);
  },
};

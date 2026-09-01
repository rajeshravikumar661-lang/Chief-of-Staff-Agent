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
  CalendarEventsResponse,
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

  async syncNow(): Promise<{ gmail: number; calendar: number; drive: number; people: number; commitmentsOverdue: number }> {
    await demoDelay();
    return { gmail: 6, calendar: 3, drive: 2, people: 3, commitmentsOverdue: 1 };
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

  async calendarEvents(_from?: string, _to?: string): Promise<CalendarEventsResponse> {
    await demoDelay();
    // Build a few events anchored to the current week (Mon–Sun) so the
    // demo week view always has something to show.
    const now = new Date();
    const monday = new Date(now);
    const dow = (monday.getUTCDay() + 6) % 7; // 0 = Monday
    monday.setUTCDate(monday.getUTCDate() - dow);
    monday.setUTCHours(0, 0, 0, 0);
    const at = (dayOffset: number, h: number, m = 0) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      d.setUTCHours(h, m, 0, 0);
      return d.toISOString();
    };
    return {
      timezone: "Europe/London",
      events: [
        {
          id: "demo-evt-1",
          externalId: "gcal-demo-1",
          title: "Acme investor meeting",
          start: at(1, 10, 0),
          end: at(1, 11, 0),
          allDay: false,
          attendees: ["jordan@acme.com", "demo@example.com"],
          location: "Zoom",
          conferenceUrl: "https://zoom.us/j/demo",
        },
        {
          id: "demo-evt-2",
          externalId: "gcal-demo-2",
          title: "Team offsite",
          start: at(2, 0, 0),
          end: at(3, 0, 0),
          allDay: true,
          attendees: [],
          location: "Brighton",
          conferenceUrl: null,
        },
        {
          id: "demo-evt-3",
          externalId: "gcal-demo-3",
          title: "1:1 with Alex",
          start: at(3, 15, 30),
          end: at(3, 16, 0),
          allDay: false,
          attendees: ["alex@example.com"],
          location: null,
          conferenceUrl: null,
        },
      ],
    };
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

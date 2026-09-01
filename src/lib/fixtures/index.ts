/**
 * Demo mode fixtures — realistic seed data around Mohin's day
 * prepping for an Acme investor meeting.
 */

import type {
  AgentRunDTO,
  AgentStepDTO,
  BriefingResponse,
  CommitmentDTO,
  ConnectionDTO,
  PersonDTO,
  SearchResponse,
  TaskDTO,
  TodayResponse,
} from "@/lib/types";

const now = new Date();
const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

// ============================================================================
// FIXTURE: Today Response
// ============================================================================

export const fixtureToday: TodayResponse = {
  greeting: "Good morning, Mohin",
  agenda: [
    { time: "09:30", title: "Product standup", eventId: "event-1" },
    { time: "11:00", title: "Investor call — Acme", eventId: "event-2" },
    { time: "14:00", title: "Product review", eventId: "event-3" },
  ],
  needsAttention: [
    {
      id: "na-1",
      text: "Alex's pricing proposal awaiting feedback",
      priority: "CRITICAL",
      refUrl: "/commitment/c-1",
    },
    {
      id: "na-2",
      text: "Acme investor meeting prep materials needed",
      priority: "HIGH",
      refUrl: "/briefing",
    },
    {
      id: "na-3",
      text: "3 unread messages from Alex",
      priority: "MEDIUM",
    },
  ],
  followUps: [
    {
      id: "fu-1",
      text: "Send Alex updated pricing by EOD",
      commitmentId: "c-1",
    },
    {
      id: "fu-2",
      text: "Confirm investor meeting logistics",
      commitmentId: "c-2",
    },
  ],
  suggestedActions: [
    {
      id: "sa-1",
      label: "Prepare investor meeting briefing",
      actionType: "PREPARE_BRIEFING",
      goal: "Prepare me for my investor meeting with Acme",
    },
    {
      id: "sa-2",
      label: "Draft reply to Alex",
      actionType: "DRAFT_REPLY",
      goal: "Draft a reply to Alex about the pricing proposal",
    },
    {
      id: "sa-3",
      label: "Summarize standing commitments",
      actionType: "SUMMARIZE",
      goal: "Give me a summary of my open commitments and deadlines",
    },
  ],
  recentRuns: [
    {
      id: "run-summary-1",
      goal: "Prepare briefing for investor call",
      status: "succeeded",
      startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      stepCount: 5,
    },
    {
      id: "run-summary-2",
      goal: "Draft follow-up to Alex on pricing",
      status: "partial",
      startedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      completedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      stepCount: 5,
    },
  ],
};

// ============================================================================
// FIXTURE: Briefing Response
// ============================================================================

export const fixtureBriefing: BriefingResponse = {
  generatedAt: thirtyMinutesAgo.toISOString(),
  items: [
    {
      id: "brief-1",
      kind: "meeting",
      title: "Acme investor meeting — 11:00 today",
      detail:
        "Quarterly investor check-in with Acme. Topics: Q3 progress, runway, hiring plans. Last meeting 90 days ago.",
      priority: "CRITICAL",
      refUrl: "https://calendar.google.com/calendar/event-2",
      suggestedActions: [
        {
          id: "sa-brief-1",
          label: "Review investor metrics",
          actionType: "PREPARE_BRIEFING",
          goal: "Prepare key metrics for the Acme investor call",
        },
      ],
    },
    {
      id: "brief-2",
      kind: "email",
      title: "Alex's pricing proposal — needs feedback",
      detail:
        "Email from Alex@company.com 2 hours ago. New tiered pricing model for enterprise tier. 3 follow-ups in conversation.",
      priority: "HIGH",
      suggestedActions: [
        {
          id: "sa-brief-2",
          label: "Draft response to Alex",
          actionType: "DRAFT_REPLY",
          goal: "Reply to Alex with feedback on the pricing proposal",
        },
      ],
    },
    {
      id: "brief-3",
      kind: "commitment",
      title: "Product roadmap for Q4",
      detail:
        "Due Friday (2 days). Dependencies: engineering team input on feasibility. 0.85 confidence.",
      priority: "HIGH",
      suggestedActions: [],
    },
    {
      id: "brief-4",
      kind: "pr",
      title: "Auth refactor in review",
      detail:
        "Awaiting your approval on PR#247. 2 files changed, 45 insertions, 23 deletions. Reviewed by 1 engineer.",
      priority: "MEDIUM",
      suggestedActions: [],
    },
    {
      id: "brief-5",
      kind: "follow_up",
      title: "Confirm investor meeting agenda",
      detail: "Need to send final agenda to Acme by end of day. 1 follow-up pending from last sync.",
      priority: "HIGH",
      suggestedActions: [],
    },
  ],
};

// ============================================================================
// FIXTURE: Connections
// ============================================================================

export const fixtureConnections: ConnectionDTO[] = [
  {
    provider: "gmail",
    status: "connected",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify"],
    connectedAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
    lastSyncAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 min ago
  },
  {
    provider: "calendar",
    status: "connected",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    connectedAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    lastSyncAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
  },
  {
    provider: "drive",
    status: "connected",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    connectedAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    lastSyncAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
  },
  {
    provider: "slack",
    status: "disconnected",
    scopes: [],
    connectedAt: null,
    lastSyncAt: null,
  },
  {
    provider: "github",
    status: "disconnected",
    scopes: [],
    connectedAt: null,
    lastSyncAt: null,
  },
  {
    provider: "notion",
    status: "disconnected",
    scopes: [],
    connectedAt: null,
    lastSyncAt: null,
  },
];

// ============================================================================
// FIXTURE: Commitments
// ============================================================================

export const fixtureCommitments: CommitmentDTO[] = [
  {
    id: "c-1",
    person: "Alex",
    description: "Provide feedback on new pricing proposal",
    deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    source: "email",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/msg-1",
    status: "open",
    confidence: 0.9,
    detectedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "c-2",
    person: "Investor Relations (Acme)",
    description: "Send final investor meeting agenda",
    deadline: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(), // EOD today
    source: "calendar",
    sourceUrl: "https://calendar.google.com/calendar/event-2",
    status: "open",
    confidence: 0.95,
    detectedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "c-3",
    person: "Engineering team",
    description: "Review and approve Q4 product roadmap",
    deadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Friday
    source: "email",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/msg-2",
    status: "open",
    confidence: 0.85,
    detectedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "c-4",
    person: "CFO",
    description: "Review quarterly metrics dashboard",
    deadline: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days overdue
    source: "email",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/msg-3",
    status: "overdue",
    confidence: 0.7,
    detectedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// FIXTURE: Tasks
// ============================================================================

export const fixtureTasks: TaskDTO[] = [
  {
    id: "task-1",
    title: "Prepare investor meeting slides",
    status: "doing",
    priority: "CRITICAL",
    deadline: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
  {
    id: "task-2",
    title: "Review PR #247 (auth refactor)",
    status: "todo",
    priority: "HIGH",
    deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    source: "github",
  },
  {
    id: "task-3",
    title: "Respond to Alex on pricing",
    status: "todo",
    priority: "HIGH",
    deadline: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
  {
    id: "task-4",
    title: "Update team on Q3 results",
    status: "done",
    priority: "MEDIUM",
    deadline: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
  {
    id: "task-5",
    title: "Schedule 1:1 with new hire",
    status: "todo",
    priority: "MEDIUM",
    deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
];

// ============================================================================
// FIXTURE: People
// ============================================================================

export const fixturePeople: PersonDTO[] = [
  {
    id: "person-1",
    name: "Alex",
    email: "alex@company.com",
    org: "Product team",
    importance: "HIGH",
    lastContactAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    openCommitments: [
      {
        id: "c-1",
        person: "Alex",
        description: "Provide feedback on new pricing proposal",
        deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        source: "email",
        sourceUrl: "https://mail.google.com/mail/u/0/#inbox/msg-1",
        status: "open",
        confidence: 0.9,
        detectedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ],
    upcomingMeetings: [
      { time: "15:00", title: "1:1 with Alex", eventId: "event-alex-1" },
    ],
    recentMessages: [
      {
        id: "msg-1",
        subject: "New pricing proposal for enterprise tier",
        snippet:
          "Hi Mohin, I've drafted a new tiered pricing model. Would love your feedback...",
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "msg-2",
        subject: "RE: Pricing proposal follow-up",
        snippet: "Any thoughts on the model I sent? Key deadline is EOD tomorrow...",
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      },
    ],
    documents: [
      {
        id: "doc-1",
        title: "Pricing Proposal - Enterprise Tier",
        url: "https://docs.google.com/document/d/pricing-enterprise",
      },
    ],
  },
  {
    id: "person-2",
    name: "Sarah Chen",
    email: "sarah@acme.com",
    org: "Acme Ventures",
    importance: "CRITICAL",
    lastContactAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    openCommitments: [
      {
        id: "c-2",
        person: "Investor Relations (Acme)",
        description: "Send final investor meeting agenda",
        deadline: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        source: "calendar",
        sourceUrl: "https://calendar.google.com/calendar/event-2",
        status: "open",
        confidence: 0.95,
        detectedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    upcomingMeetings: [
      { time: "11:00", title: "Investor call — Acme", eventId: "event-2" },
    ],
    recentMessages: [
      {
        id: "msg-3",
        subject: "Confirming 11am call today",
        snippet: "Looking forward to our quarterly sync today. Can you send the agenda by 10am?",
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    documents: [
      {
        id: "doc-2",
        title: "Acme Investment Agreement - Current",
        url: "https://docs.google.com/document/d/acme-agreement",
      },
      {
        id: "doc-3",
        title: "Q3 Metrics Dashboard",
        url: "https://docs.google.com/spreadsheets/d/q3-metrics",
      },
    ],
  },
  {
    id: "person-3",
    name: "Engineering Lead",
    email: "eng@company.com",
    org: "Engineering team",
    importance: "HIGH",
    lastContactAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
    openCommitments: [
      {
        id: "c-3",
        person: "Engineering team",
        description: "Review and approve Q4 product roadmap",
        deadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        source: "email",
        sourceUrl: "https://mail.google.com/mail/u/0/#inbox/msg-2",
        status: "open",
        confidence: 0.85,
        detectedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    upcomingMeetings: [
      { time: "09:30", title: "Product standup", eventId: "event-1" },
    ],
    recentMessages: [
      {
        id: "msg-4",
        subject: "Q4 roadmap feasibility feedback",
        snippet:
          "Reviewed the Q4 roadmap. We can do most of it, but the ML features need...",
        timestamp: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      },
    ],
    documents: [],
  },
];

// ============================================================================
// FIXTURE: Search Results
// ============================================================================

export const fixtureSearchResults: SearchResponse = {
  messages: [
    {
      id: "search-msg-1",
      subject: "New pricing proposal for enterprise tier",
      snippet: "Hi Mohin, I've drafted a new tiered pricing model...",
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "search-msg-2",
      subject: "RE: Pricing proposal follow-up",
      snippet: "Any thoughts on the model I sent? Key deadline is EOD tomorrow...",
      timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    },
  ],
  documents: [
    {
      id: "search-doc-1",
      title: "Pricing Proposal - Enterprise Tier",
      url: "https://docs.google.com/document/d/pricing-enterprise",
      snippet: "New tiered pricing model with three tiers...",
    },
    {
      id: "search-doc-2",
      title: "Q3 Metrics Dashboard",
      url: "https://docs.google.com/spreadsheets/d/q3-metrics",
      snippet: "Quarterly results: 23% growth, 150K ARR...",
    },
  ],
  events: [
    {
      id: "search-event-1",
      title: "Investor call — Acme",
      startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "search-event-2",
      title: "Product standup",
      startTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    },
  ],
  people: [
    {
      id: "person-1",
      name: "Alex",
      email: "alex@company.com",
    },
    {
      id: "person-2",
      name: "Sarah Chen",
      email: "sarah@acme.com",
    },
  ],
};

// ============================================================================
// FIXTURE: Audit Logs
// ============================================================================

export const fixtureAuditLogs: {
  id: string;
  action: string;
  tool: string | null;
  runId: string | null;
  stepId: string | null;
  result: unknown;
  timestamp: string;
}[] = [
  {
    id: "log-1",
    action: "step_completed",
    tool: "calendar.search",
    runId: "run-summary-1",
    stepId: "run-summary-1-s1",
    result: { eventCount: 1, title: "Investor call — Acme" },
    timestamp: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
  },
  {
    id: "log-2",
    action: "step_completed",
    tool: "gmail.search",
    runId: "run-summary-1",
    stepId: "run-summary-1-s2",
    result: { messageCount: 6, keywords: ["acme", "investor", "meeting"] },
    timestamp: new Date(now.getTime() - 85 * 60 * 1000).toISOString(),
  },
  {
    id: "log-3",
    action: "step_completed",
    tool: "drive.search",
    runId: "run-summary-1",
    stepId: "run-summary-1-s3",
    result: { documentCount: 2, documents: ["Q3 Metrics", "Acme Agreement"] },
    timestamp: new Date(now.getTime() - 80 * 60 * 1000).toISOString(),
  },
  {
    id: "log-4",
    action: "step_completed",
    tool: "briefing.generate",
    runId: "run-summary-1",
    stepId: "run-summary-1-s4",
    result: { itemCount: 5 },
    timestamp: new Date(now.getTime() - 75 * 60 * 1000).toISOString(),
  },
  {
    id: "log-5",
    action: "step_completed",
    tool: "gmail.create_draft",
    runId: "run-summary-1",
    stepId: "run-summary-1-s5",
    result: { draftId: "draft-123", subject: "Follow-up: Acme Investor Call" },
    timestamp: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
  },
  {
    id: "log-6",
    action: "run_completed",
    tool: null,
    runId: "run-summary-1",
    stepId: null,
    result: { status: "succeeded" },
    timestamp: new Date(now.getTime() - 65 * 60 * 1000).toISOString(),
  },
  {
    id: "log-7",
    action: "step_failed",
    tool: "gmail.create_draft",
    runId: "run-summary-2",
    stepId: "run-summary-2-s5",
    result: { error: "User rejected step" },
    timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "log-8",
    action: "run_stopped",
    tool: null,
    runId: "run-summary-2",
    stepId: null,
    result: { status: "partial" },
    timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// FUNCTION: Build a demo run with 5-step plan
// ============================================================================

export function buildDemoRun(goal: string): AgentRunDTO {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startTime = new Date().toISOString();

  const steps: AgentStepDTO[] = [
    {
      id: `${runId}-s1`,
      index: 0,
      tool: "calendar.search",
      title: "Search calendar for related event",
      permission: "READ",
      status: "pending",
      requiresApproval: false,
      summary: null,
    },
    {
      id: `${runId}-s2`,
      index: 1,
      tool: "gmail.search",
      title: "Search Gmail for related threads",
      permission: "READ",
      status: "pending",
      requiresApproval: false,
      summary: null,
    },
    {
      id: `${runId}-s3`,
      index: 2,
      tool: "drive.search",
      title: "Search Drive for related documents",
      permission: "READ",
      status: "pending",
      requiresApproval: false,
      summary: null,
    },
    {
      id: `${runId}-s4`,
      index: 3,
      tool: "briefing.generate",
      title: "Generate briefing summary",
      permission: "READ",
      status: "pending",
      requiresApproval: false,
      summary: null,
    },
    {
      id: `${runId}-s5`,
      index: 4,
      tool: "gmail.create_draft",
      title: "Draft follow-up email",
      permission: "DRAFT",
      status: "pending",
      requiresApproval: true,
      summary: null,
      arguments: {
        to: "sarah.chen@acme.com",
        subject: "Following up — investor call agenda & Q3 metrics",
        body: "Hi Sarah,\n\nLooking forward to our call today at 11:00. I've attached the Q3 metrics summary and a draft agenda covering runway and hiring plans — let me know if you'd like to add anything before we speak.\n\nBest,\nMohin",
      },
    },
  ];

  return {
    id: runId,
    goal,
    status: "in_progress",
    summary: null,
    startedAt: startTime,
    completedAt: null,
    steps,
  };
}

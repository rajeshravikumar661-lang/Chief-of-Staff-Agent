/**
 * Gmail connector tools (spec §6). Every tool declares its permission level;
 * WRITE tools also ship a `verify()` that re-checks Gmail as the source of truth
 * before a step may be marked `succeeded` (CLAUDE.md rule 4).
 *
 * Tool arguments are validated against these Zod schemas by the Action Manager
 * before `execute()` runs (CLAUDE.md rule 3).
 */
import { z } from "zod";
import { defineTool, type Tool } from "@/agent/tools/types";
import {
  searchMessages,
  getThread,
  getMessage,
  createDraft,
  sendMessage,
  archiveMessage,
  modifyLabels,
} from "./client";

const searchSchema = z.object({
  query: z.string().min(1, "query is required"),
  max: z.number().int().positive().max(100).optional(),
});

const getThreadSchema = z.object({
  threadId: z.string().min(1, "threadId is required"),
});

const createDraftSchema = z.object({
  to: z.string().min(1, "to is required"),
  subject: z.string(),
  body: z.string(),
  threadId: z.string().min(1).optional(),
});

const sendSchema = createDraftSchema;

const archiveSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const labelSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    add: z.array(z.string().min(1)).optional(),
    remove: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, {
    message: "provide at least one label to add or remove",
  });

type SearchInput = z.infer<typeof searchSchema>;
type GetThreadInput = z.infer<typeof getThreadSchema>;
type CreateDraftInput = z.infer<typeof createDraftSchema>;
type SendInput = z.infer<typeof sendSchema>;
type ArchiveInput = z.infer<typeof archiveSchema>;
type LabelInput = z.infer<typeof labelSchema>;

/** Extracts the bare address from a `Name <addr@host>` header fragment. */
function normalizeAddr(s: string): string {
  const angle = s.match(/<([^>]+)>/);
  return (angle ? angle[1] : s).trim().toLowerCase();
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const searchTool = defineTool<SearchInput>({
  name: "gmail.search",
  description:
    "Search the user's Gmail with a Gmail query string (e.g. 'from:alice newer_than:7d subject:invoice'). Returns up to `max` normalized message headers. Read-only.",
  permission: "READ",
  inputSchema: searchSchema,
  async execute(input, ctx) {
    const messages = await searchMessages(
      ctx.userId,
      input.query,
      input.max ?? 15,
    );
    return {
      ok: true,
      data: messages,
      summary: `Found ${messages.length} message(s) for "${input.query}".`,
    };
  },
});

const getThreadTool = defineTool<GetThreadInput>({
  name: "gmail.get_thread",
  description:
    "Fetch every message in a Gmail thread by threadId, as normalized headers (from/to/subject/date/snippet). Read-only.",
  permission: "READ",
  inputSchema: getThreadSchema,
  async execute(input, ctx) {
    const thread = await getThread(ctx.userId, input.threadId);
    return {
      ok: true,
      data: thread,
      summary: `Thread ${input.threadId} has ${thread.messages.length} message(s).`,
    };
  },
});

const createDraftTool = defineTool<CreateDraftInput>({
  name: "gmail.create_draft",
  description:
    "Create a Gmail draft (never sends). Pass `threadId` to draft a reply inside an existing thread. Returns the draft id.",
  permission: "DRAFT",
  inputSchema: createDraftSchema,
  async execute(input, ctx) {
    const draft = await createDraft(ctx.userId, {
      to: input.to,
      subject: input.subject,
      body: input.body,
      threadId: input.threadId,
    });
    return {
      ok: true,
      data: draft,
      summary: `Drafted email to ${input.to} — "${input.subject}" (draft ${draft.id}).`,
    };
  },
});

const sendTool = defineTool<SendInput>({
  name: "gmail.send",
  description:
    "Send an email from the user's Gmail account. Pass `threadId` to send as a reply in an existing thread. Irreversible — requires an approved step.",
  permission: "WRITE",
  inputSchema: sendSchema,
  async execute(input, ctx) {
    const sent = await sendMessage(ctx.userId, {
      to: input.to,
      subject: input.subject,
      body: input.body,
      threadId: input.threadId,
    });
    return {
      ok: true,
      data: sent,
      summary: `Sent email to ${input.to} — "${input.subject}" (message ${sent.id}).`,
    };
  },
  async verify(input, result, ctx) {
    const data = result.data as { id?: string } | undefined;
    const id = data?.id;
    if (!id) return { verified: false, detail: "Send returned no message id." };
    try {
      const fetched = await getMessage(ctx.userId, id);
      const recipientMatch = fetched.to
        .split(",")
        .map(normalizeAddr)
        .includes(normalizeAddr(input.to));
      const subjectMatch = fetched.subject.trim() === input.subject.trim();
      if (recipientMatch && subjectMatch) {
        return {
          verified: true,
          detail: `Confirmed message ${id} in Gmail: to=${fetched.to}, subject="${fetched.subject}".`,
        };
      }
      return {
        verified: false,
        detail: `Mismatch on message ${id}: to="${fetched.to}" (expected "${input.to}"), subject="${fetched.subject}" (expected "${input.subject}").`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-fetch sent message ${id}: ${errText(err)}`,
      };
    }
  },
});

const archiveTool = defineTool<ArchiveInput>({
  name: "gmail.archive",
  description:
    "Archive a message by removing its INBOX label. Requires an approved step.",
  permission: "WRITE",
  inputSchema: archiveSchema,
  async execute(input, ctx) {
    const raw = await archiveMessage(ctx.userId, input.id);
    return {
      ok: true,
      data: raw,
      summary: `Archived message ${input.id} (INBOX removed).`,
    };
  },
  async verify(input, _result, ctx) {
    try {
      // An empty modify is a no-op that echoes the message's current labels.
      const raw = await modifyLabels(ctx.userId, input.id, {});
      return raw.labelIds.includes("INBOX")
        ? {
            verified: false,
            detail: `Message ${input.id} still carries the INBOX label.`,
          }
        : {
            verified: true,
            detail: `Confirmed message ${input.id} no longer has INBOX (labels: ${raw.labelIds.join(", ") || "none"}).`,
          };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-fetch message ${input.id}: ${errText(err)}`,
      };
    }
  },
});

const labelTool = defineTool<LabelInput>({
  name: "gmail.label",
  description:
    "Add and/or remove Gmail label ids on a message (e.g. add ['STARRED'], remove ['UNREAD']). Requires an approved step.",
  permission: "WRITE",
  inputSchema: labelSchema,
  async execute(input, ctx) {
    const raw = await modifyLabels(ctx.userId, input.id, {
      add: input.add,
      remove: input.remove,
    });
    return {
      ok: true,
      data: raw,
      summary: `Updated labels on ${input.id}: +[${(input.add ?? []).join(", ")}] -[${(input.remove ?? []).join(", ")}].`,
    };
  },
  async verify(input, _result, ctx) {
    try {
      const raw = await modifyLabels(ctx.userId, input.id, {});
      const labels = new Set(raw.labelIds);
      const missingAdds = (input.add ?? []).filter((l) => !labels.has(l));
      const lingeringRemoves = (input.remove ?? []).filter((l) =>
        labels.has(l),
      );
      if (missingAdds.length === 0 && lingeringRemoves.length === 0) {
        return {
          verified: true,
          detail: `Confirmed labels on ${input.id}: ${raw.labelIds.join(", ") || "none"}.`,
        };
      }
      return {
        verified: false,
        detail: `Label mismatch on ${input.id}: missing adds [${missingAdds.join(", ")}], lingering removes [${lingeringRemoves.join(", ")}].`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-fetch message ${input.id}: ${errText(err)}`,
      };
    }
  },
});

export const gmailTools: Tool[] = [
  searchTool,
  getThreadTool,
  createDraftTool,
  sendTool,
  archiveTool,
  labelTool,
];

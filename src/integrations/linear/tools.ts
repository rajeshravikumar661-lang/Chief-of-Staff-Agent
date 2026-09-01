/**
 * Linear connector tools (spec §6). READ tools are side-effect free; the DRAFT
 * tool does a light verify of the created issue; the WRITE tool ships a
 * `verify()` that re-reads the issue's comments and confirms ours landed
 * (CLAUDE.md rule 4).
 *
 * Tool arguments are validated against these Zod schemas by the Action Manager
 * before `execute()` runs (CLAUDE.md rule 3). `execute()` never throws — every
 * failure is returned as `{ ok: false, ... }`.
 */
import { z } from "zod";
import { defineTool, type Tool } from "@/agent/tools/types";
import {
  myAssignedIssues,
  searchIssues,
  getIssue,
  createIssue,
  commentOnIssue,
} from "./client";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const myIssuesSchema = z.object({});

const searchSchema = z.object({
  term: z.string().min(1, "term is required"),
  first: z.number().int().positive().max(50).optional(),
});

const getIssueSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const createIssueSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
});

const commentSchema = z.object({
  issueId: z.string().min(1, "issueId is required"),
  body: z.string().min(1, "body is required"),
});

type MyIssuesInput = z.infer<typeof myIssuesSchema>;
type SearchInput = z.infer<typeof searchSchema>;
type GetIssueInput = z.infer<typeof getIssueSchema>;
type CreateIssueInputT = z.infer<typeof createIssueSchema>;
type CommentInput = z.infer<typeof commentSchema>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const myIssuesTool = defineTool<MyIssuesInput>({
  name: "linear.my_issues",
  description:
    "List the open Linear issues assigned to the user (not completed or canceled), newest first, up to 40. Read-only.",
  permission: "READ",
  inputSchema: myIssuesSchema,
  async execute(_input, ctx) {
    try {
      const issues = await myAssignedIssues(ctx.userId);
      return {
        ok: true,
        data: issues,
        summary: `You have ${issues.length} open Linear issue(s) assigned.`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: "Could not list your Linear issues.",
        error: errText(err),
      };
    }
  },
});

const searchTool = defineTool<SearchInput>({
  name: "linear.search",
  description:
    "Full-text search Linear issues by term. Returns up to `first` (default 20, max 50) normalized issues. Read-only.",
  permission: "READ",
  inputSchema: searchSchema,
  async execute(input, ctx) {
    try {
      const issues = await searchIssues(ctx.userId, input.term, input.first ?? 20);
      return {
        ok: true,
        data: issues,
        summary: `Found ${issues.length} Linear issue(s) for "${input.term}".`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not search Linear for "${input.term}".`,
        error: errText(err),
      };
    }
  },
});

const getIssueTool = defineTool<GetIssueInput>({
  name: "linear.get_issue",
  description:
    "Fetch one Linear issue with its description and comments, by human identifier (e.g. 'ENG-123') or uuid. Read-only.",
  permission: "READ",
  inputSchema: getIssueSchema,
  async execute(input, ctx) {
    try {
      const issue = await getIssue(ctx.userId, input.id);
      return {
        ok: true,
        data: issue,
        summary: `${issue.identifier} — "${issue.title}" (${issue.stateName || "unknown state"}), ${issue.comments.length} comment(s).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not fetch Linear issue ${input.id}.`,
        error: errText(err),
      };
    }
  },
});

const createIssueTool = defineTool<CreateIssueInputT>({
  name: "linear.create_issue",
  description:
    "Create a Linear issue in a team. Pass `teamId` (from listTeams), `title`, and optional `description`. Returns the new issue url. Requires an approved step.",
  permission: "DRAFT",
  inputSchema: createIssueSchema,
  async execute(input, ctx) {
    try {
      const created = await createIssue(ctx.userId, {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
      });
      if (!created.success || !created.issue) {
        return {
          ok: false,
          summary: `Linear rejected the new issue "${input.title}".`,
          error: "issueCreate returned success=false or no issue.",
        };
      }
      // Light verify: the returned issue should carry our title.
      const titleMatch = created.issue.title.trim() === input.title.trim();
      return {
        ok: true,
        data: created.issue,
        summary: titleMatch
          ? `Created ${created.issue.identifier} — ${created.issue.url}`
          : `Created ${created.issue.identifier} (title mismatch) — ${created.issue.url}`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not create Linear issue "${input.title}".`,
        error: errText(err),
      };
    }
  },
});

const commentTool = defineTool<CommentInput>({
  name: "linear.comment",
  description:
    "Add a comment to a Linear issue. `issueId` is the issue uuid. Irreversible — requires an approved step.",
  permission: "WRITE",
  inputSchema: commentSchema,
  async execute(input, ctx) {
    try {
      const created = await commentOnIssue(ctx.userId, input.issueId, input.body);
      if (!created.success || !created.comment) {
        return {
          ok: false,
          summary: `Linear rejected the comment on ${input.issueId}.`,
          error: "commentCreate returned success=false or no comment.",
        };
      }
      return {
        ok: true,
        data: created.comment,
        summary: `Commented on Linear issue ${input.issueId} (comment ${created.comment.id}).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not comment on Linear issue ${input.issueId}.`,
        error: errText(err),
      };
    }
  },
  async verify(input, result, ctx) {
    const data = result.data as { id?: string } | undefined;
    const commentId = data?.id;
    if (!commentId) {
      return { verified: false, detail: "Comment returned no id." };
    }
    try {
      const issue = await getIssue(ctx.userId, input.issueId);
      const mine = issue.comments.find((c) => c.id === commentId);
      if (mine && mine.body.trim() === input.body.trim()) {
        return {
          verified: true,
          detail: `Confirmed comment ${commentId} on ${issue.identifier}.`,
        };
      }
      if (mine) {
        return {
          verified: false,
          detail: `Comment ${commentId} found on ${issue.identifier} but body differs.`,
        };
      }
      return {
        verified: false,
        detail: `Comment ${commentId} not present on ${issue.identifier}.`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-fetch issue ${input.issueId}: ${errText(err)}`,
      };
    }
  },
});

export const linearTools: Tool[] = [
  myIssuesTool,
  searchTool,
  getIssueTool,
  createIssueTool,
  commentTool,
];

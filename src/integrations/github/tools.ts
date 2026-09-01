/**
 * GitHub connector tools (spec §6). Every tool declares its permission level;
 * the WRITE tool ships a `verify()` that re-checks GitHub as the source of truth
 * before a step may be marked `succeeded` (CLAUDE.md rule 4).
 *
 * Tool arguments are validated against these Zod schemas by the Action Manager
 * before `execute()` runs (CLAUDE.md rule 3). `execute()` never throws — every
 * failure path returns `{ ok: false, ... }`.
 */
import { z } from "zod";
import { defineTool, type Tool } from "@/agent/tools/types";
import {
  listReviewRequests,
  listAssignedIssues,
  getPR,
  getIssue,
  commentOnIssue,
  listIssueComments,
  whoAmI,
} from "./client";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const emptySchema = z.object({});

const refSchema = z.object({
  owner: z.string().min(1, "owner is required"),
  repo: z.string().min(1, "repo is required"),
  number: z.number().int().positive("number must be a positive integer"),
});

const commentSchema = refSchema.extend({
  body: z.string().min(1, "body is required"),
});

type EmptyInput = z.infer<typeof emptySchema>;
type RefInput = z.infer<typeof refSchema>;
type CommentInput = z.infer<typeof commentSchema>;

const reviewRequestsTool = defineTool<EmptyInput>({
  name: "github.review_requests",
  description:
    "List open pull requests that are awaiting the user's review (review-requested:@me). Read-only.",
  permission: "READ",
  inputSchema: emptySchema,
  async execute(_input, ctx) {
    try {
      const items = await listReviewRequests(ctx.userId);
      return {
        ok: true,
        data: items,
        summary: `${items.length} pull request(s) awaiting your review.`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: "Could not list review requests.",
        error: errText(err),
      };
    }
  },
});

const myIssuesTool = defineTool<EmptyInput>({
  name: "github.my_issues",
  description:
    "List open GitHub issues assigned to the user (assignee:@me is:open). Read-only.",
  permission: "READ",
  inputSchema: emptySchema,
  async execute(_input, ctx) {
    try {
      const items = await listAssignedIssues(ctx.userId);
      return {
        ok: true,
        data: items,
        summary: `${items.length} open issue(s) assigned to you.`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: "Could not list assigned issues.",
        error: errText(err),
      };
    }
  },
});

const getPrTool = defineTool<RefInput>({
  name: "github.get_pr",
  description:
    "Fetch a single pull request by owner/repo/number, as a normalized record (repo/number/title/url/state/updatedAt/author). Read-only.",
  permission: "READ",
  inputSchema: refSchema,
  async execute(input, ctx) {
    try {
      const pr = await getPR(ctx.userId, input.owner, input.repo, input.number);
      return {
        ok: true,
        data: pr,
        summary: `PR ${input.owner}/${input.repo}#${input.number}: "${pr.title}" (${pr.state}).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not fetch PR ${input.owner}/${input.repo}#${input.number}.`,
        error: errText(err),
      };
    }
  },
});

const getIssueTool = defineTool<RefInput>({
  name: "github.get_issue",
  description:
    "Fetch a single issue by owner/repo/number, as a normalized record (repo/number/title/url/state/updatedAt/author). Read-only.",
  permission: "READ",
  inputSchema: refSchema,
  async execute(input, ctx) {
    try {
      const issue = await getIssue(
        ctx.userId,
        input.owner,
        input.repo,
        input.number,
      );
      return {
        ok: true,
        data: issue,
        summary: `Issue ${input.owner}/${input.repo}#${input.number}: "${issue.title}" (${issue.state}).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not fetch issue ${input.owner}/${input.repo}#${input.number}.`,
        error: errText(err),
      };
    }
  },
});

const commentTool = defineTool<CommentInput>({
  name: "github.comment",
  description:
    "Post a comment on a GitHub issue or pull request (owner/repo/number). Irreversible — requires an approved step.",
  permission: "WRITE",
  inputSchema: commentSchema,
  async execute(input, ctx) {
    try {
      const comment = await commentOnIssue(
        ctx.userId,
        input.owner,
        input.repo,
        input.number,
        input.body,
      );
      return {
        ok: true,
        data: comment,
        summary: `Commented on ${input.owner}/${input.repo}#${input.number} (comment ${comment.id}).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not comment on ${input.owner}/${input.repo}#${input.number}.`,
        error: errText(err),
      };
    }
  },
  async verify(input, result, ctx) {
    const data = result.data as { id?: number } | undefined;
    const id = data?.id;
    try {
      const me = await whoAmI(ctx.userId);
      const comments = await listIssueComments(
        ctx.userId,
        input.owner,
        input.repo,
        input.number,
      );
      const mine = comments.filter(
        (c) => c.author.toLowerCase() === me.login.toLowerCase(),
      );
      const match = mine.find(
        (c) =>
          (id !== undefined && c.id === id) ||
          c.body.trim() === input.body.trim(),
      );
      if (match) {
        return {
          verified: true,
          detail: `Confirmed comment ${match.id} by ${me.login} on ${input.owner}/${input.repo}#${input.number}.`,
        };
      }
      return {
        verified: false,
        detail: `Did not find our comment on ${input.owner}/${input.repo}#${input.number} among the ${comments.length} recent comment(s).`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-list comments on ${input.owner}/${input.repo}#${input.number}: ${errText(err)}`,
      };
    }
  },
});

export const githubTools: Tool[] = [
  reviewRequestsTool,
  myIssuesTool,
  getPrTool,
  getIssueTool,
  commentTool,
];

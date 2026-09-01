import { z } from "zod";
import {
  defineTool,
  type Tool,
  type ToolResult,
  type VerificationResult,
} from "@/agent/tools/types";
import {
  createPage,
  getPage,
  NotionConnectionError,
  queryDatabase,
  search,
  type CreatedNotionPage,
} from "./client";

function toErrorResult(err: unknown, summary: string): ToolResult {
  if (err instanceof NotionConnectionError) {
    return { ok: false, summary: "Notion is not connected.", error: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, summary, error: message };
}

/* -------------------------------- search -------------------------------- */

const searchSchema = z.object({
  query: z.string().min(1),
  pageSize: z.number().int().positive().max(100).optional(),
});
type SearchInput = z.infer<typeof searchSchema>;

const searchTool = defineTool<SearchInput>({
  name: "notion.search",
  description:
    "Search the user's Notion workspace for pages and databases by keyword. " +
    "Returns normalized results (id, title, url, lastEditedTime, snippet).",
  inputSchema: searchSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const results = await search(ctx.userId, input.query, input.pageSize ?? 15);
      return {
        ok: true,
        data: results,
        summary: `Found ${results.length} Notion result(s) for "${input.query}".`,
      };
    } catch (err) {
      return toErrorResult(err, "Notion search failed.");
    }
  },
});

/* -------------------------------- get_page ------------------------------ */

const getPageSchema = z.object({ pageId: z.string().min(1) });
type GetPageInput = z.infer<typeof getPageSchema>;

const getPageTool = defineTool<GetPageInput>({
  name: "notion.get_page",
  description:
    "Fetch a single Notion page's metadata plus its block content flattened " +
    "to plain text (first ~5k characters).",
  inputSchema: getPageSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const page = await getPage(ctx.userId, input.pageId);
      return {
        ok: true,
        data: page,
        summary: `Fetched "${page.title}" — ${page.content.length} chars of text.`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not fetch Notion page ${input.pageId}.`);
    }
  },
});

/* ----------------------------- query_database -------------------------- */

const queryDatabaseSchema = z.object({ databaseId: z.string().min(1) });
type QueryDatabaseInput = z.infer<typeof queryDatabaseSchema>;

const queryDatabaseTool = defineTool<QueryDatabaseInput>({
  name: "notion.query_database",
  description:
    "List the pages (rows) of a Notion database. Returns normalized page " +
    "metadata (id, title, url, lastEditedTime).",
  inputSchema: queryDatabaseSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const rows = await queryDatabase(ctx.userId, input.databaseId);
      return {
        ok: true,
        data: rows,
        summary: `Database ${input.databaseId} has ${rows.length} item(s).`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not query Notion database ${input.databaseId}.`);
    }
  },
});

/* ------------------------------ create_task --------------------------- */

const createTaskSchema = z.object({
  databaseId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
});
type CreateTaskInput = z.infer<typeof createTaskSchema>;

const createTaskTool = defineTool<CreateTaskInput>({
  name: "notion.create_task",
  description:
    "Create a new page (task) in a Notion database with the given title and " +
    "optional body text. Treated as a DRAFT action the user reviews.",
  inputSchema: createTaskSchema,
  permission: "DRAFT",
  async execute(input, ctx) {
    try {
      const page = await createPage(ctx.userId, {
        parentDatabaseId: input.databaseId,
        title: input.title,
        content: input.content,
      });
      return {
        ok: true,
        data: page,
        summary: `Created Notion task "${input.title}" (${page.url}).`,
      };
    } catch (err) {
      return toErrorResult(err, "Failed to create Notion task.");
    }
  },
  async verify(_input, result): Promise<VerificationResult> {
    const page = result.data as CreatedNotionPage | undefined;
    if (page?.id && page.url) {
      return { verified: true, detail: `Task created at ${page.url}` };
    }
    return { verified: false, detail: "No page url returned from create." };
  },
});

export const notionTools: Tool[] = [
  searchTool,
  getPageTool,
  queryDatabaseTool,
  createTaskTool,
];

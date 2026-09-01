import { z } from "zod";
import {
  defineTool,
  type Tool,
  type ToolResult,
  type VerificationResult,
} from "@/agent/tools/types";
import { ConnectionMissingError } from "@/integrations/google/auth";
import {
  createDocument,
  getFile,
  searchFiles,
  type CreatedDoc,
} from "./client";

function toErrorResult(err: unknown, summary: string): ToolResult {
  if (err instanceof ConnectionMissingError) {
    return { ok: false, summary: "Google Drive is not connected.", error: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, summary, error: message };
}

/* --------------------------------- search --------------------------------- */

const searchSchema = z.object({
  query: z.string().min(1),
  max: z.number().int().positive().max(100).optional(),
});
type SearchInput = z.infer<typeof searchSchema>;

const searchTool = defineTool<SearchInput>({
  name: "drive.search",
  description:
    "Search the user's Google Drive by file name and full-text content. " +
    "Returns normalized file metadata (id, title, mimeType, url, modifiedTime, snippet).",
  inputSchema: searchSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const files = await searchFiles(ctx.userId, input.query, input.max ?? 15);
      return {
        ok: true,
        data: files,
        summary: `Found ${files.length} Drive file(s) matching "${input.query}".`,
      };
    } catch (err) {
      return toErrorResult(err, "Drive search failed.");
    }
  },
});

/* -------------------------------- get_file ------------------------------- */

const getFileSchema = z.object({ fileId: z.string().min(1) });
type GetFileInput = z.infer<typeof getFileSchema>;

const getFileTool = defineTool<GetFileInput>({
  name: "drive.get_file",
  description:
    "Fetch a single Drive file's metadata plus its extracted plain text " +
    "(Google Docs are exported as text; text/* files are downloaded).",
  inputSchema: getFileSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const file = await getFile(ctx.userId, input.fileId);
      return {
        ok: true,
        data: file,
        summary: `Fetched "${file.title}" (${file.mimeType})${
          file.content ? ` — ${file.content.length} chars of text` : ""
        }.`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not fetch file ${input.fileId}.`);
    }
  },
});

/* ---------------------------- create_document --------------------------- */

const createDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});
type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

const createDocumentTool = defineTool<CreateDocumentInput>({
  name: "drive.create_document",
  description:
    "Create a new Google Doc in the user's Drive with the given title and body text. " +
    "Treated as a DRAFT action — it produces a document the user reviews before sharing.",
  inputSchema: createDocumentSchema,
  permission: "DRAFT",
  async execute(input, ctx) {
    try {
      const doc = await createDocument(ctx.userId, {
        title: input.title,
        content: input.content,
      });
      return {
        ok: true,
        data: doc,
        summary: `Created draft Google Doc "${input.title}" (${doc.url}).`,
      };
    } catch (err) {
      return toErrorResult(err, "Failed to create Google Doc.");
    }
  },
  async verify(_input, result): Promise<VerificationResult> {
    const doc = result.data as CreatedDoc | undefined;
    if (doc?.id && doc.url) {
      return { verified: true, detail: `Document created at ${doc.url}` };
    }
    return { verified: false, detail: "No document url returned from create." };
  },
});

export const driveTools: Tool[] = [
  searchTool,
  getFileTool,
  createDocumentTool,
];

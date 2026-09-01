import { z } from "zod";
import {
  defineTool,
  type Tool,
  type ToolResult,
} from "@/agent/tools/types";
import { ConnectionMissingError } from "@/integrations/google/auth";
import {
  getDoc,
  getPresentation,
  getSpreadsheet,
  readRange,
} from "./client";

function toErrorResult(err: unknown, summary: string): ToolResult {
  if (err instanceof ConnectionMissingError) {
    return {
      ok: false,
      summary: "Google Workspace is not connected.",
      error: err.message,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, summary, error: message };
}

/* ------------------------------- sheets.get ---------------------------- */

const sheetsGetSchema = z.object({ spreadsheetId: z.string().min(1) });
type SheetsGetInput = z.infer<typeof sheetsGetSchema>;

const sheetsGetTool = defineTool<SheetsGetInput>({
  name: "sheets.get",
  description:
    "Get a Google Spreadsheet's metadata: title, url and the list of sheets " +
    "with their ids and row/column dimensions. Accepts a full Sheets URL or a bare id.",
  inputSchema: sheetsGetSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const meta = await getSpreadsheet(ctx.userId, input.spreadsheetId);
      return {
        ok: true,
        data: meta,
        summary: `"${meta.title}" — ${meta.sheets.length} sheet(s).`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not read spreadsheet ${input.spreadsheetId}.`);
    }
  },
});

/* --------------------------- sheets.read_range ----------------------- */

const sheetsReadRangeSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
});
type SheetsReadRangeInput = z.infer<typeof sheetsReadRangeSchema>;

const sheetsReadRangeTool = defineTool<SheetsReadRangeInput>({
  name: "sheets.read_range",
  description:
    "Read cell values from a Google Spreadsheet for an A1 range (e.g. 'Sheet1!A1:D20'). " +
    "Returns { range, values } where values is a 2D array of strings. " +
    "Accepts a full Sheets URL or a bare id.",
  inputSchema: sheetsReadRangeSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const res = await readRange(ctx.userId, input.spreadsheetId, input.range);
      return {
        ok: true,
        data: res,
        summary: `Read ${res.values.length} row(s) from ${res.range}.`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not read range ${input.range}.`);
    }
  },
});

/* -------------------------------- docs.get --------------------------- */

const docsGetSchema = z.object({ documentId: z.string().min(1) });
type DocsGetInput = z.infer<typeof docsGetSchema>;

const docsGetTool = defineTool<DocsGetInput>({
  name: "docs.get",
  description:
    "Fetch a Google Doc's title and body as plain text (first ~10k characters). " +
    "Accepts a full Docs URL or a bare id.",
  inputSchema: docsGetSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const doc = await getDoc(ctx.userId, input.documentId);
      return {
        ok: true,
        data: doc,
        summary: `"${doc.title}" — ${doc.text.length} chars of text.`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not read document ${input.documentId}.`);
    }
  },
});

/* ------------------------------- slides.get -------------------------- */

const slidesGetSchema = z.object({ presentationId: z.string().min(1) });
type SlidesGetInput = z.infer<typeof slidesGetSchema>;

const slidesGetTool = defineTool<SlidesGetInput>({
  name: "slides.get",
  description:
    "Fetch a Google Slides presentation's title and the plain text of each slide. " +
    "Returns { title, slides: { index, text }[] }. Accepts a full Slides URL or a bare id.",
  inputSchema: slidesGetSchema,
  permission: "READ",
  async execute(input, ctx) {
    try {
      const pres = await getPresentation(ctx.userId, input.presentationId);
      return {
        ok: true,
        data: pres,
        summary: `"${pres.title}" — ${pres.slides.length} slide(s).`,
      };
    } catch (err) {
      return toErrorResult(err, `Could not read presentation ${input.presentationId}.`);
    }
  },
});

export const gworkspaceTools: Tool[] = [
  sheetsGetTool,
  sheetsReadRangeTool,
  docsGetTool,
  slidesGetTool,
];

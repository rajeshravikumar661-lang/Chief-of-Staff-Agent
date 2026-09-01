import { google } from "googleapis";
import type { docs_v1, sheets_v4, slides_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getGoogleClient,
  markConnectionError,
} from "@/integrations/google/auth";

/**
 * Normalized wrappers over the Google Sheets v4 / Docs v1 / Slides v1 read
 * APIs. These ride the *same* Google OAuth connection as the Drive connector:
 * the token is read via `provider: "drive"` and the Google consent covers all
 * Google APIs (scopes declared in src/auth.ts). The agent only ever sees the
 * normalized shapes below.
 */

/* ------------------------------- id parsing ------------------------------ */

/**
 * Accepts a full Google URL (Sheets/Docs/Slides) or a bare id and returns the
 * bare id. Google resource ids appear as `/d/<id>` in the canonical URL form.
 */
export function extractGoogleId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  const fromPath = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = trimmed.match(/[?&](?:id|key)=([a-zA-Z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  return trimmed;
}

/* --------------------------------- types -------------------------------- */

export interface SheetInfo {
  title: string;
  sheetId: number;
  rowCount: number | null;
  columnCount: number | null;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  url: string;
  sheets: SheetInfo[];
}

export interface RangeValues {
  range: string;
  values: string[][];
}

export interface DocContent {
  documentId: string;
  title: string;
  text: string;
}

export interface SlideText {
  index: number;
  text: string;
}

export interface PresentationContent {
  presentationId: string;
  title: string;
  slides: SlideText[];
}

const DOC_TEXT_LIMIT = 10_000;

/* -------------------------------- clients ------------------------------- */

async function googleAuth(userId: string): Promise<OAuth2Client> {
  // Same connection as the Drive connector — one Google consent, all APIs.
  return getGoogleClient(userId, "drive");
}

async function sheetsApi(userId: string): Promise<sheets_v4.Sheets> {
  return google.sheets({ version: "v4", auth: await googleAuth(userId) });
}

async function docsApi(userId: string): Promise<docs_v1.Docs> {
  return google.docs({ version: "v1", auth: await googleAuth(userId) });
}

async function slidesApi(userId: string): Promise<slides_v1.Slides> {
  return google.slides({ version: "v1", auth: await googleAuth(userId) });
}

function isAuthError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const codes = [e.code, e.status, e.response?.status];
  return codes.some((c) => c === 401 || c === 403);
}

async function withAuthGuard<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) {
      await markConnectionError(userId, "drive");
    }
    throw err;
  }
}

/* --------------------------------- Sheets ------------------------------- */

export async function getSpreadsheet(
  userId: string,
  spreadsheetId: string,
): Promise<SpreadsheetMeta> {
  const id = extractGoogleId(spreadsheetId);
  const sheets = await sheetsApi(userId);
  const res = await withAuthGuard(userId, () =>
    sheets.spreadsheets.get({
      spreadsheetId: id,
      fields:
        "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
    }),
  );
  const data = res.data;
  const sheetInfos: SheetInfo[] = (data.sheets ?? []).map((s) => {
    const p = s.properties ?? {};
    const grid = p.gridProperties ?? {};
    return {
      title: p.title ?? "(untitled)",
      sheetId: p.sheetId ?? 0,
      rowCount: grid.rowCount ?? null,
      columnCount: grid.columnCount ?? null,
    };
  });
  return {
    spreadsheetId: data.spreadsheetId ?? id,
    title: data.properties?.title ?? "(untitled)",
    url:
      data.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${id}/edit`,
    sheets: sheetInfos,
  };
}

export async function readRange(
  userId: string,
  spreadsheetId: string,
  range: string,
): Promise<RangeValues> {
  const id = extractGoogleId(spreadsheetId);
  const sheets = await sheetsApi(userId);
  const res = await withAuthGuard(userId, () =>
    sheets.spreadsheets.values.get({ spreadsheetId: id, range }),
  );
  const rawRows = res.data.values ?? [];
  const values: string[][] = rawRows.map((row) =>
    (row as unknown[]).map((cell) => (cell == null ? "" : String(cell))),
  );
  return { range: res.data.range ?? range, values };
}

/* ---------------------------------- Docs -------------------------------- */

function flattenDocBody(body: docs_v1.Schema$Body | undefined): string {
  const parts: string[] = [];
  for (const el of body?.content ?? []) {
    const paragraph = el.paragraph;
    if (!paragraph) continue;
    let line = "";
    for (const pe of paragraph.elements ?? []) {
      const content = pe.textRun?.content;
      if (content) line += content;
    }
    parts.push(line);
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export async function getDoc(
  userId: string,
  documentId: string,
): Promise<DocContent> {
  const id = extractGoogleId(documentId);
  const docs = await docsApi(userId);
  const res = await withAuthGuard(userId, () =>
    docs.documents.get({ documentId: id }),
  );
  const text = flattenDocBody(res.data.body ?? undefined).slice(
    0,
    DOC_TEXT_LIMIT,
  );
  return {
    documentId: res.data.documentId ?? id,
    title: res.data.title ?? "(untitled)",
    text,
  };
}

/* --------------------------------- Slides ------------------------------- */

function slideText(page: slides_v1.Schema$Page): string {
  const parts: string[] = [];
  for (const pe of page.pageElements ?? []) {
    for (const te of pe.shape?.text?.textElements ?? []) {
      const content = te.textRun?.content;
      if (content) parts.push(content);
    }
    for (const row of pe.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        for (const te of cell.text?.textElements ?? []) {
          const content = te.textRun?.content;
          if (content) parts.push(content);
        }
      }
    }
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export async function getPresentation(
  userId: string,
  presentationId: string,
): Promise<PresentationContent> {
  const id = extractGoogleId(presentationId);
  const slides = await slidesApi(userId);
  const res = await withAuthGuard(userId, () =>
    slides.presentations.get({ presentationId: id }),
  );
  const data = res.data;
  const out: SlideText[] = (data.slides ?? []).map((s, index) => ({
    index,
    text: slideText(s),
  }));
  return {
    presentationId: data.presentationId ?? id,
    title: data.title ?? "(untitled)",
    slides: out,
  };
}

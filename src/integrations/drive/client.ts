import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getGoogleClient,
  markConnectionError,
} from "@/integrations/google/auth";

/**
 * Normalized wrappers over the Google Drive v3 API (+ Docs v1 for document
 * creation). The agent only ever sees the normalized shapes below (spec §7).
 */

export interface NormalizedFile {
  id: string;
  title: string;
  mimeType: string;
  url: string;
  modifiedTime: string;
  snippet: string | null;
}

export interface FileWithContent extends NormalizedFile {
  /** Extracted plain text when cheaply available, else null. */
  content: string | null;
}

export interface CreatedDoc {
  id: string;
  url: string;
}

const FILE_FIELDS = "id,name,mimeType,webViewLink,modifiedTime,description";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

async function driveApi(userId: string): Promise<drive_v3.Drive> {
  const auth: OAuth2Client = await getGoogleClient(userId, "drive");
  return google.drive({ version: "v3", auth });
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

/** Escape a value for embedding inside a Drive query string literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeFile(f: drive_v3.Schema$File): NormalizedFile {
  const id = f.id ?? "";
  return {
    id,
    title: f.name ?? "(untitled)",
    mimeType: f.mimeType ?? "",
    url:
      f.webViewLink ??
      (id ? `https://drive.google.com/file/d/${id}/view` : ""),
    modifiedTime: f.modifiedTime ?? "",
    snippet: f.description ?? null,
  };
}

function coerceText(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }
  return String(data);
}

async function extractText(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
): Promise<string | null> {
  try {
    if (mimeType === GOOGLE_DOC_MIME) {
      const res = await drive.files.export(
        { fileId, mimeType: "text/plain" },
        { responseType: "text" },
      );
      return coerceText(res.data);
    }
    if (mimeType.startsWith("text/")) {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" },
      );
      return coerceText(res.data);
    }
  } catch (err) {
    console.error("[drive/client] text extraction failed", fileId, err);
  }
  return null;
}

export async function searchFiles(
  userId: string,
  q: string,
  max = 15,
): Promise<NormalizedFile[]> {
  const drive = await driveApi(userId);
  const safe = escapeQueryValue(q);
  const res = await withAuthGuard(userId, () =>
    drive.files.list({
      q: `trashed = false and (name contains '${safe}' or fullText contains '${safe}')`,
      pageSize: Math.min(Math.max(max, 1), 100),
      orderBy: "modifiedTime desc",
      fields: `files(${FILE_FIELDS})`,
      spaces: "drive",
    }),
  );
  return (res.data.files ?? []).map(normalizeFile);
}

export async function getFile(
  userId: string,
  id: string,
): Promise<FileWithContent> {
  const drive = await driveApi(userId);
  const meta = await withAuthGuard(userId, () =>
    drive.files.get({ fileId: id, fields: FILE_FIELDS }),
  );
  const file = normalizeFile(meta.data);
  const content = await extractText(drive, id, file.mimeType);
  return {
    ...file,
    content,
    snippet:
      file.snippet ??
      (content ? content.slice(0, 200).replace(/\s+/g, " ").trim() : null),
  };
}

export async function listRecentFiles(
  userId: string,
  max = 50,
): Promise<NormalizedFile[]> {
  const drive = await driveApi(userId);
  const res = await withAuthGuard(userId, () =>
    drive.files.list({
      q: "trashed = false",
      pageSize: Math.min(Math.max(max, 1), 1000),
      orderBy: "modifiedTime desc",
      fields: `files(${FILE_FIELDS})`,
      spaces: "drive",
    }),
  );
  return (res.data.files ?? []).map(normalizeFile);
}

/** Export plain text for a single file id (used by sync). Never throws. */
export async function exportFileText(
  userId: string,
  id: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const drive = await driveApi(userId);
    return await extractText(drive, id, mimeType);
  } catch (err) {
    console.error("[drive/client] exportFileText failed", id, err);
    return null;
  }
}

export async function createDocument(
  userId: string,
  input: { title: string; content: string },
): Promise<CreatedDoc> {
  const auth: OAuth2Client = await getGoogleClient(userId, "drive");
  const docs = google.docs({ version: "v1", auth });

  const created = await withAuthGuard(userId, () =>
    docs.documents.create({ requestBody: { title: input.title } }),
  );
  const id = created.data.documentId;
  if (!id) {
    throw new Error("Google Docs API did not return a documentId");
  }

  if (input.content.length > 0) {
    await withAuthGuard(userId, () =>
      docs.documents.batchUpdate({
        documentId: id,
        requestBody: {
          requests: [
            { insertText: { location: { index: 1 }, text: input.content } },
          ],
        },
      }),
    );
  }

  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
}

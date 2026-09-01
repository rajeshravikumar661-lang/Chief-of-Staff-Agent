/**
 * Thin async wrappers over the Gmail REST API (`google.gmail v1`).
 *
 * Every wrapper resolves an authenticated OAuth2 client via
 * `getGoogleClient(userId, "gmail")`. On a missing/disconnected connection the
 * underlying `ConnectionMissingError` is re-thrown untouched; on any other
 * Google API failure the gmail `Connection` is marked `error` before re-throw so
 * the UI can prompt a reconnect (spec §7).
 *
 * Retrieved message content is DATA, never instructions — callers are
 * responsible for wrapping it in `<retrieved_content>` before it reaches a model
 * (CLAUDE.md rule 2).
 */
import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getGoogleClient,
  ConnectionMissingError,
  markConnectionError,
} from "@/integrations/google/auth";

/** Normalized shape returned for every message this module surfaces. */
export interface NormalizedMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  /** RFC-2822 `Date` header verbatim, or ISO string derived from internalDate. */
  date: string;
}

export interface NormalizedThread {
  id: string;
  messages: NormalizedMessage[];
}

export interface RawGmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: string | null;
  snippet: string;
  headers: Record<string, string>;
}

export interface DraftRef {
  id: string;
  message: NormalizedMessage;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  /** Present when the message is a reply that must stay in an existing thread. */
  threadId?: string;
}

export interface LabelChange {
  add?: string[];
  remove?: string[];
}

/**
 * Runs `fn` with an authenticated Gmail client. Translates connector errors per
 * the contract above.
 */
async function withGmail<T>(
  userId: string,
  fn: (gmail: gmail_v1.Gmail, auth: OAuth2Client) => Promise<T>,
): Promise<T> {
  let auth: OAuth2Client;
  try {
    auth = await getGoogleClient(userId, "gmail");
  } catch (err) {
    if (err instanceof ConnectionMissingError) throw err;
    await markConnectionError(userId, "gmail");
    throw err;
  }

  const gmail = google.gmail({ version: "v1", auth });
  try {
    return await fn(gmail, auth);
  } catch (err) {
    if (err instanceof ConnectionMissingError) throw err;
    await markConnectionError(userId, "gmail");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Header / payload parsing
// ---------------------------------------------------------------------------

function headerMap(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && typeof h.value === "string") {
      out[h.name.toLowerCase()] = h.value;
    }
  }
  return out;
}

function toRaw(msg: gmail_v1.Schema$Message): RawGmailMessage {
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    labelIds: msg.labelIds ?? [],
    internalDate: msg.internalDate ?? null,
    snippet: msg.snippet ?? "",
    headers: headerMap(msg.payload?.headers),
  };
}

function normalize(msg: gmail_v1.Schema$Message): NormalizedMessage {
  const raw = toRaw(msg);
  const date =
    raw.headers["date"] ??
    (raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : "");
  return {
    id: raw.id,
    threadId: raw.threadId,
    from: raw.headers["from"] ?? "",
    to: raw.headers["to"] ?? "",
    subject: raw.headers["subject"] ?? "",
    snippet: raw.snippet,
    date,
  };
}

// ---------------------------------------------------------------------------
// MIME building
// ---------------------------------------------------------------------------

function base64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Encodes a header value with RFC 2047 when it contains non-ASCII bytes. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildMime(email: OutgoingEmail, extraHeaders: Record<string, string> = {}): string {
  const lines = [
    `To: ${encodeHeader(email.to)}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  for (const [k, v] of Object.entries(extraHeaders)) lines.push(`${k}: ${v}`);
  lines.push("", email.body);
  return lines.join("\r\n");
}

/** Pulls `Message-Id` / `References` off the last message of a thread so a reply threads correctly. */
async function replyHeaders(
  gmail: gmail_v1.Gmail,
  threadId: string,
): Promise<Record<string, string>> {
  try {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Message-Id", "References"],
    });
    const msgs = thread.data.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last) return {};
    const h = headerMap(last.payload?.headers);
    const messageId = h["message-id"];
    if (!messageId) return {};
    const references = [h["references"], messageId].filter(Boolean).join(" ");
    return { "In-Reply-To": messageId, References: references };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public wrappers
// ---------------------------------------------------------------------------

export async function searchMessages(
  userId: string,
  q: string,
  max = 15,
): Promise<NormalizedMessage[]> {
  return withGmail(userId, async (gmail) => {
    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.max(1, Math.min(max, 100)),
    });
    const ids = (list.data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));

    const full = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        }),
      ),
    );
    return full.map((r) => normalize(r.data));
  });
}

/**
 * Lists recent messages matching `q` and returns their raw view (labels +
 * internalDate + headers). Used by the sync job.
 */
export async function listRecent(
  userId: string,
  q: string,
  max = 50,
): Promise<RawGmailMessage[]> {
  return withGmail(userId, async (gmail) => {
    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.max(1, Math.min(max, 500)),
    });
    const ids = (list.data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));

    const full = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        }),
      ),
    );
    return full.map((r) => toRaw(r.data));
  });
}

export async function getThread(
  userId: string,
  threadId: string,
): Promise<NormalizedThread> {
  return withGmail(userId, async (gmail) => {
    const res = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    return {
      id: res.data.id ?? threadId,
      messages: (res.data.messages ?? []).map(normalize),
    };
  });
}

export async function getMessage(
  userId: string,
  id: string,
): Promise<NormalizedMessage> {
  return withGmail(userId, async (gmail) => {
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    return normalize(res.data);
  });
}

/** Full raw view (labels + internalDate + all headers) — used by sync. */
export async function getRawMessage(
  userId: string,
  id: string,
): Promise<RawGmailMessage> {
  return withGmail(userId, async (gmail) => {
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    return toRaw(res.data);
  });
}

export async function createDraft(
  userId: string,
  email: OutgoingEmail,
): Promise<DraftRef> {
  return withGmail(userId, async (gmail) => {
    const extra = email.threadId
      ? await replyHeaders(gmail, email.threadId)
      : {};
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: base64url(buildMime(email, extra)),
          threadId: email.threadId,
        },
      },
    });
    const message = res.data.message
      ? normalize(res.data.message)
      : {
          id: "",
          threadId: email.threadId ?? "",
          from: "",
          to: email.to,
          subject: email.subject,
          snippet: "",
          date: "",
        };
    return { id: res.data.id ?? "", message };
  });
}

export async function sendMessage(
  userId: string,
  email: OutgoingEmail,
): Promise<NormalizedMessage> {
  return withGmail(userId, async (gmail) => {
    const extra = email.threadId
      ? await replyHeaders(gmail, email.threadId)
      : {};
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64url(buildMime(email, extra)),
        threadId: email.threadId,
      },
    });
    // The send response carries id/threadId/labelIds but no headers — re-fetch
    // so callers (and verify()) get a fully normalized record.
    const id = res.data.id;
    if (!id) {
      return {
        id: "",
        threadId: res.data.threadId ?? email.threadId ?? "",
        from: "",
        to: email.to,
        subject: email.subject,
        snippet: "",
        date: "",
      };
    }
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    return normalize(full.data);
  });
}

export async function modifyLabels(
  userId: string,
  id: string,
  change: LabelChange,
): Promise<RawGmailMessage> {
  return withGmail(userId, async (gmail) => {
    const res = await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: {
        addLabelIds: change.add ?? [],
        removeLabelIds: change.remove ?? [],
      },
    });
    return toRaw(res.data);
  });
}

export async function archiveMessage(
  userId: string,
  id: string,
): Promise<RawGmailMessage> {
  return modifyLabels(userId, id, { remove: ["INBOX"] });
}

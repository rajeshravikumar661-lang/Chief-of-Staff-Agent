/**
 * Gmail → `Message` sync (spec §7). Pulls the last ~30 days of mail (capped) and
 * upserts each into the per-user `Message` table, then stamps the gmail
 * `Connection.lastSyncAt`.
 *
 * A single message that fails to parse is skipped — the job never aborts the
 * whole batch for one bad row. `ConnectionMissingError` (and other connector
 * errors surfaced by the client) still propagate so the caller can react.
 */
import { scopedDb } from "@/lib/db";
import { listRecent, type RawGmailMessage } from "./client";

const LOOKBACK_QUERY = "newer_than:30d";
// Capped low on purpose: a slow host (Render free tier) must finish a full
// Gmail sync inside the per-connector timeout window.
const MAX_MESSAGES = 30;

function toTimestamp(raw: RawGmailMessage): Date {
  if (raw.internalDate) {
    const ms = Number(raw.internalDate);
    if (Number.isFinite(ms) && ms > 0) return new Date(ms);
  }
  const header = raw.headers["date"];
  if (header) {
    const parsed = new Date(header);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function splitRecipients(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function syncGmail(userId: string): Promise<number> {
  const db = scopedDb(userId);

  // Connector errors (ConnectionMissingError et al.) propagate to the caller.
  const raws = await listRecent(userId, LOOKBACK_QUERY, MAX_MESSAGES ?? 30);

  let synced = 0;
  for (const raw of raws) {
    try {
      if (!raw.id) continue;
      const timestamp = toTimestamp(raw);
      const unread = raw.labelIds.includes("UNREAD");
      const subject = raw.headers["subject"] ?? null;
      const sender = raw.headers["from"] ?? null;
      const recipients = splitRecipients(raw.headers["to"]);

      await db.message.upsert({
        where: {
          userId_provider_externalId: {
            userId,
            provider: "gmail",
            externalId: raw.id,
          },
        },
        create: {
          userId,
          provider: "gmail",
          externalId: raw.id,
          threadId: raw.threadId || null,
          sender,
          recipients,
          subject,
          snippet: raw.snippet || null,
          unread,
          timestamp,
          metadata: { labelIds: raw.labelIds },
        },
        update: {
          threadId: raw.threadId || null,
          sender,
          recipients,
          subject,
          snippet: raw.snippet || null,
          unread,
          timestamp,
          metadata: { labelIds: raw.labelIds },
        },
      });
      synced += 1;
    } catch (err) {
      console.error(
        `[gmail/sync] skipped message ${raw.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  await db.connection.updateMany({
    where: { provider: "gmail" },
    data: { lastSyncAt: new Date() },
  });

  return synced;
}

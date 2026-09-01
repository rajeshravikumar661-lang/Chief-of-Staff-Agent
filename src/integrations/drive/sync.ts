import { scopedDb } from "@/lib/db";
import { exportFileText, listRecentFiles } from "./client";

const MAX_FILES = 50;
const MAX_CONTENT_CHARS = 5000;
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/**
 * Pull the ~50 most recently modified Drive files and upsert them into the
 * `Document` table (spec §7). Plain text is stored only when it is cheap to
 * extract (Google Docs and text/* files); otherwise `content` is null.
 * Per-item failures are logged and skipped. Returns the number of documents
 * successfully upserted.
 */
export async function syncDrive(userId: string): Promise<number> {
  const files = await listRecentFiles(userId, MAX_FILES);
  const db = scopedDb(userId);

  let count = 0;
  for (const f of files) {
    if (!f.id) continue;
    try {
      const extractable =
        f.mimeType === GOOGLE_DOC_MIME || f.mimeType.startsWith("text/");
      const rawContent = extractable
        ? await exportFileText(userId, f.id, f.mimeType)
        : null;
      const content = rawContent ? rawContent.slice(0, MAX_CONTENT_CHARS) : null;

      await db.document.upsert({
        where: {
          userId_provider_externalId: {
            userId,
            provider: "drive",
            externalId: f.id,
          },
        },
        create: {
          userId,
          provider: "drive",
          externalId: f.id,
          title: f.title,
          url: f.url,
          content,
        },
        update: {
          title: f.title,
          url: f.url,
          content,
        },
      });
      count += 1;
    } catch (err) {
      console.error("[drive/sync] skipping file", f.id, err);
    }
  }

  try {
    await db.connection.updateMany({
      where: { provider: "drive" },
      data: { lastSyncAt: new Date() },
    });
  } catch (err) {
    console.error("[drive/sync] failed to update lastSyncAt", err);
  }

  return count;
}

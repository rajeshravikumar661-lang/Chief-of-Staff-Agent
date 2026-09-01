/**
 * Slack → `Message` sync (spec §7). Pulls the last ~2 days of messages from the
 * channels the connected account belongs to (capped), upserts each into the
 * per-user `Message` table, then stamps the slack `Connection.lastSyncAt`.
 *
 * The job never throws: a missing connection returns 0, and a single channel or
 * message that fails is logged and skipped rather than aborting the batch.
 */
import { prisma, scopedDb } from "@/lib/db";
import {
  listConversations,
  getChannelHistory,
  type NormalizedSlackMessage,
} from "./client";

const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 50;
const PER_CHANNEL_LIMIT = 30;

function logSkip(scope: string, id: string, err: unknown): void {
  console.error(
    `[slack/sync] skipped ${scope} ${id}: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}

export async function syncSlack(userId: string): Promise<number> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "slack" } },
  });
  if (!conn || conn.status !== "connected" || !conn.accessTokenEncrypted) {
    return 0;
  }

  const db = scopedDb(userId);
  const oldestSec = (Date.now() - LOOKBACK_MS) / 1000;

  let channels: Awaited<ReturnType<typeof listConversations>> = [];
  try {
    channels = await listConversations(userId);
  } catch (err) {
    logSkip("channel-list", userId, err);
    return 0;
  }

  const collected: NormalizedSlackMessage[] = [];
  for (const ch of channels) {
    if (collected.length >= MAX_MESSAGES) break;
    if (!ch.isMember) continue;
    try {
      const msgs = await getChannelHistory(userId, ch.id, PER_CHANNEL_LIMIT);
      for (const m of msgs) {
        if (!m.ts || Number(m.ts) < oldestSec) continue;
        collected.push({ ...m, channelName: m.channelName ?? ch.name });
        if (collected.length >= MAX_MESSAGES) break;
      }
    } catch (err) {
      logSkip("channel", ch.id, err);
    }
  }

  let synced = 0;
  for (const m of collected) {
    try {
      if (!m.ts) continue;
      const timestamp = new Date(Number(m.ts) * 1000);
      const channelName = m.channelName ?? m.channel;
      const sender = m.userName ?? m.user ?? null;
      const subject = channelName ? `#${channelName}` : null;
      const text = m.text || null;
      const metadata = { channel: m.channel, permalink: m.permalink ?? null };

      await db.message.upsert({
        where: {
          userId_provider_externalId: {
            userId,
            provider: "slack",
            externalId: m.ts,
          },
        },
        create: {
          userId,
          provider: "slack",
          externalId: m.ts,
          threadId: m.channel || null,
          sender,
          recipients: [],
          subject,
          snippet: text,
          body: text,
          timestamp,
          metadata,
        },
        update: {
          threadId: m.channel || null,
          sender,
          subject,
          snippet: text,
          body: text,
          timestamp,
          metadata,
        },
      });
      synced += 1;
    } catch (err) {
      logSkip("message", m.ts, err);
    }
  }

  await db.connection.updateMany({
    where: { provider: "slack" },
    data: { lastSyncAt: new Date() },
  });

  return synced;
}

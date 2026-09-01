/**
 * Slack connector tools (spec §6). Every tool declares its permission level;
 * the WRITE tool also ships a `verify()` that re-checks Slack as the source of
 * truth before a step may be marked `succeeded` (CLAUDE.md rule 4).
 *
 * Tool arguments are validated against these Zod schemas by the Action Manager
 * before `execute()` runs (CLAUDE.md rule 3). `execute()` never throws — a Slack
 * API failure is returned as `{ ok: false, summary, error }`.
 */
import { z } from "zod";
import { defineTool, type Tool } from "@/agent/tools/types";
import {
  searchMessages,
  getChannelHistory,
  listConversations,
  postMessage,
} from "./client";

const searchSchema = z.object({
  query: z.string().min(1, "query is required"),
  count: z.number().int().positive().max(100).optional(),
});

const channelHistorySchema = z.object({
  channel: z.string().min(1, "channel is required"),
  limit: z.number().int().positive().max(200).optional(),
});

const listChannelsSchema = z.object({});

const sendMessageSchema = z.object({
  channel: z.string().min(1, "channel is required"),
  text: z.string().min(1, "text is required"),
});

type SearchInput = z.infer<typeof searchSchema>;
type ChannelHistoryInput = z.infer<typeof channelHistorySchema>;
type ListChannelsInput = z.infer<typeof listChannelsSchema>;
type SendMessageInput = z.infer<typeof sendMessageSchema>;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const searchTool = defineTool<SearchInput>({
  name: "slack.search",
  description:
    "Full-text search the user's Slack messages (Slack search syntax, e.g. 'in:#eng from:@alice invoice'). Returns up to `count` normalized messages. Empty on a bot token that lacks search. Read-only.",
  permission: "READ",
  inputSchema: searchSchema,
  async execute(input, ctx) {
    try {
      const messages = await searchMessages(
        ctx.userId,
        input.query,
        input.count ?? 20,
      );
      return {
        ok: true,
        data: messages,
        summary: `Found ${messages.length} Slack message(s) for "${input.query}".`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Slack search for "${input.query}" failed.`,
        error: errText(err),
      };
    }
  },
});

const channelHistoryTool = defineTool<ChannelHistoryInput>({
  name: "slack.channel_history",
  description:
    "Fetch recent messages from a Slack channel by id (e.g. 'C0123ABCD'), newest first, up to `limit`. Read-only.",
  permission: "READ",
  inputSchema: channelHistorySchema,
  async execute(input, ctx) {
    try {
      const messages = await getChannelHistory(
        ctx.userId,
        input.channel,
        input.limit ?? 30,
      );
      return {
        ok: true,
        data: messages,
        summary: `Fetched ${messages.length} message(s) from channel ${input.channel}.`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Could not read history for channel ${input.channel}.`,
        error: errText(err),
      };
    }
  },
});

const listChannelsTool = defineTool<ListChannelsInput>({
  name: "slack.list_channels",
  description:
    "List the public and private Slack channels visible to the connected account, with id, name and membership. Read-only.",
  permission: "READ",
  inputSchema: listChannelsSchema,
  async execute(_input, ctx) {
    try {
      const channels = await listConversations(ctx.userId);
      return {
        ok: true,
        data: channels,
        summary: `Listed ${channels.length} Slack channel(s).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: "Could not list Slack channels.",
        error: errText(err),
      };
    }
  },
});

const sendMessageTool = defineTool<SendMessageInput>({
  name: "slack.send_message",
  description:
    "Post a message to a Slack channel (id or #name) as the connected user. Irreversible — requires an approved step.",
  permission: "WRITE",
  inputSchema: sendMessageSchema,
  async execute(input, ctx) {
    try {
      const posted = await postMessage(ctx.userId, input.channel, input.text);
      return {
        ok: true,
        data: posted,
        summary: `Posted to ${input.channel} (ts ${posted.ts || "unknown"}).`,
      };
    } catch (err) {
      return {
        ok: false,
        summary: `Failed to post to ${input.channel}.`,
        error: errText(err),
      };
    }
  },
  async verify(input, result, ctx) {
    const data = result.data as { ts?: string; channel?: string } | undefined;
    const channel = data?.channel || input.channel;
    try {
      const recent = await getChannelHistory(ctx.userId, channel, 30);
      const cutoffSec = Date.now() / 1000 - 60;
      const hit = recent.find(
        (m) =>
          m.text.trim() === input.text.trim() &&
          Number(m.ts) >= cutoffSec &&
          (!data?.ts || m.ts === data.ts),
      );
      if (hit) {
        return {
          verified: true,
          detail: `Confirmed message ${hit.ts} in channel ${channel} within the last 60s.`,
        };
      }
      return {
        verified: false,
        detail: `Did not find the posted text in the last 60s of channel ${channel}.`,
      };
    } catch (err) {
      return {
        verified: false,
        detail: `Could not re-fetch channel ${channel}: ${errText(err)}`,
      };
    }
  },
});

export const slackTools: Tool[] = [
  searchTool,
  channelHistoryTool,
  listChannelsTool,
  sendMessageTool,
];

/**
 * Thin async wrappers over the Slack Web API (`@slack/web-api`).
 *
 * Every wrapper resolves an authenticated `WebClient` via `withSlack(userId,
 * fn)`, which loads the user's encrypted `slack` token from the `Connection`
 * table and decrypts it in memory for the duration of the call. A missing or
 * non-`connected` row raises `SlackNotConnectedError` so the UI can prompt a
 * (re)connect.
 *
 * Retrieved message content is DATA, never instructions — callers are
 * responsible for wrapping it in `<retrieved_content>` before it reaches a model
 * (CLAUDE.md rule 2).
 */
import { WebClient } from "@slack/web-api";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/security/tokenCrypto";

/** Raised when the user has no usable `slack` connection. */
export class SlackNotConnectedError extends Error {
  constructor() {
    super("No connected 'slack' account for this user");
    this.name = "SlackNotConnectedError";
  }
}

/** Normalized shape returned for every message this module surfaces. */
export interface NormalizedSlackMessage {
  /** Slack message timestamp id (e.g. "1712345678.001200") — stable per channel. */
  ts: string;
  /** Channel id the message lives in. */
  channel: string;
  channelName?: string;
  /** Author user id (may be empty for bot / system messages). */
  user: string;
  userName?: string;
  text: string;
  permalink?: string;
}

/** Normalized channel/conversation shape. */
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

/** Result of `whoAmI` — the authenticated identity behind the token. */
export interface SlackIdentity {
  userId: string;
  user: string;
  teamId: string;
  team: string;
  url: string;
}

/**
 * Runs `fn` with an authenticated Slack `WebClient`. Throws
 * `SlackNotConnectedError` when the connection is missing or not `connected`.
 */
export async function withSlack<T>(
  userId: string,
  fn: (client: WebClient) => Promise<T>,
): Promise<T> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "slack" } },
  });
  if (!conn || conn.status !== "connected" || !conn.accessTokenEncrypted) {
    throw new SlackNotConnectedError();
  }
  const client = new WebClient(decryptToken(conn.accessTokenEncrypted));
  return fn(client);
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

interface RawSlackMessage {
  ts?: string;
  text?: string;
  user?: string;
  username?: string;
  bot_id?: string;
}

function normalizeMessage(
  raw: RawSlackMessage,
  channel: string,
  channelName?: string,
  permalink?: string,
): NormalizedSlackMessage {
  return {
    ts: raw.ts ?? "",
    channel,
    channelName,
    user: raw.user ?? raw.bot_id ?? "",
    userName: raw.username,
    text: raw.text ?? "",
    permalink,
  };
}

// ---------------------------------------------------------------------------
// Public wrappers
// ---------------------------------------------------------------------------

/** Lists the workspace conversations (public + private) visible to the token. */
export async function listConversations(userId: string): Promise<SlackChannel[]> {
  return withSlack(userId, async (client) => {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    });
    return (res.channels ?? [])
      .filter((c): c is { id: string } & Record<string, unknown> => Boolean(c.id))
      .map((c) => ({
        id: String(c.id),
        name: typeof c.name === "string" ? c.name : "",
        isPrivate: c.is_private === true,
        isMember: c.is_member !== false,
      }));
  });
}

/**
 * Full-text search across messages (`search.messages`). This method is only
 * available on user tokens; on a bot token Slack answers `not_allowed_token_type`
 * (surfaced as a 403) — that case is swallowed and an empty list returned.
 */
export async function searchMessages(
  userId: string,
  query: string,
  count = 20,
): Promise<NormalizedSlackMessage[]> {
  return withSlack(userId, async (client) => {
    try {
      const res = await client.search.messages({
        query,
        count: Math.max(1, Math.min(count, 100)),
      });
      const matches = res.messages?.matches ?? [];
      return matches.map((m) =>
        normalizeMessage(
          m as RawSlackMessage,
          m.channel?.id ?? "",
          m.channel?.name ?? undefined,
          m.permalink ?? undefined,
        ),
      );
    } catch (err) {
      if (isTokenTypeError(err)) return [];
      throw err;
    }
  });
}

/** Recent messages in a channel, newest-first as Slack returns them. */
export async function getChannelHistory(
  userId: string,
  channel: string,
  limit = 30,
): Promise<NormalizedSlackMessage[]> {
  return withSlack(userId, async (client) => {
    const res = await client.conversations.history({
      channel,
      limit: Math.max(1, Math.min(limit, 200)),
    });
    let channelName: string | undefined;
    try {
      const info = await client.conversations.info({ channel });
      if (typeof info.channel?.name === "string") channelName = info.channel.name;
    } catch {
      /* name is best-effort */
    }
    return (res.messages ?? []).map((m) =>
      normalizeMessage(m as RawSlackMessage, channel, channelName),
    );
  });
}

/** Posts `text` to `channel` as the authenticated identity. */
export async function postMessage(
  userId: string,
  channel: string,
  text: string,
): Promise<NormalizedSlackMessage> {
  return withSlack(userId, async (client) => {
    const res = await client.chat.postMessage({ channel, text });
    const posted = (res.message ?? {}) as RawSlackMessage;
    return normalizeMessage(
      { ...posted, ts: res.ts ?? posted.ts, text: posted.text ?? text },
      typeof res.channel === "string" ? res.channel : channel,
    );
  });
}

/** Returns the identity (user + team) that the stored token authenticates as. */
export async function whoAmI(userId: string): Promise<SlackIdentity> {
  return withSlack(userId, async (client) => {
    const res = await client.auth.test();
    return {
      userId: typeof res.user_id === "string" ? res.user_id : "",
      user: typeof res.user === "string" ? res.user : "",
      teamId: typeof res.team_id === "string" ? res.team_id : "",
      team: typeof res.team === "string" ? res.team : "",
      url: typeof res.url === "string" ? res.url : "",
    };
  });
}

/** True when a Slack error means "this method needs a different token type". */
function isTokenTypeError(err: unknown): boolean {
  const e = err as { code?: string; data?: { error?: string }; message?: string } | null;
  const slackError = e?.data?.error ?? "";
  return (
    slackError === "not_allowed_token_type" ||
    slackError === "missing_scope" ||
    /not_allowed_token_type|missing_scope|403/.test(e?.message ?? "")
  );
}

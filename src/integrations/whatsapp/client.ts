/**
 * Multi-tenant WhatsApp channel via Baileys.
 *
 * Each user links their OWN WhatsApp from the dashboard (scan a QR → "Linked
 * devices"). The system then messages them on their own number (self-chat).
 * Auth state is per-user, stored in Postgres (see dbAuthState.ts) — not the
 * filesystem — so a linked session survives redeploys and restarts on any
 * host, including ones with no persistent disk (Vercel's /tmp, Render's free
 * tier). Same database the rest of the app already depends on.
 *
 * Sockets are still long-lived and in-process — this works on a persistent
 * Node server (local `npm run dev`, a VPS, Render, Railway) but NOT on
 * Vercel serverless: a function is frozen right after it responds, so a QR
 * shows but pairing (which needs the socket to stay open while the phone
 * confirms) never completes. Host the app (or at least these routes + the
 * worker) on a persistent process for WhatsApp to work. See DEPLOY.md.
 */
import makeWASocket, {
  DisconnectReason,
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { prisma } from "@/lib/db";
import { useDbAuthState, hasDbAuthState, clearDbAuthState } from "@/integrations/whatsapp/dbAuthState";
import { runWhatsAppTurn } from "@/agent/whatsappAgent";

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "warn" });

/** Time we wait for a socket to reach "open" or produce a QR before returning. */
const CONNECT_WAIT_MS = 45_000;
/** Minimum spacing between background self-heal reconnect attempts. */
const SELF_HEAL_COOLDOWN_MS = 5_000;

export type WAStatus = "unpaired" | "qr" | "connecting" | "connected";

interface UserWA {
  sock?: WASocket;
  status: WAStatus;
  qr?: string;
  selfJid?: string;
  /** set while a connect attempt is in flight (see `connectChain`) */
  starting?: Promise<unknown>;
  /** the single pending reconnect timer, if any — never schedule a second */
  reconnectTimer?: ReturnType<typeof setTimeout>;
  /** consecutive unexpected-disconnect count, for reconnect backoff */
  retries?: number;
  /** set by unlink() so in-flight sockets / timers stop touching this user */
  unlinked?: boolean;
  /** earliest time getState() may kick a background reconnect */
  nextRetryAt?: number;
  lastError?: string;
  /** unix seconds when the current socket was created — inbound messages older
   * than this are ignored so a reconnect doesn't replay + answer a backlog */
  socketStartedAt?: number;
}

/**
 * Module-level registry, keyed strictly by userId. Every value is a distinct
 * object; nothing here is ever shared between users. All public entry points
 * validate the userId first (see assertSafeUserId) so one user can neither read
 * another user's auth state nor address another user's entry.
 */
const reg = new Map<string, UserWA>();

/**
 * IDs of messages WE sent into a self-chat. Kora's own replies come straight
 * back through `messages.upsert` as `fromMe` on the same chat — without this the
 * agent would answer itself forever. Bounded so a long-lived process can't leak.
 */
const sentIds = new Set<string>();
/** Recent outbound text — a second-line echo guard when the id doesn't match. */
const sentTexts = new Set<string>();
/** userIds with an inbound turn currently in flight (one at a time per user). */
const handling = new Set<string>();
/**
 * Ids of inbound messages we've already picked up. This — not `socketStartedAt`
 * — is the replay guard: a short spin-down + reconnect can redeliver a very
 * recent message, and we still want to answer it once (but only once). Bounded
 * so a long-lived process can't leak.
 */
const seenInboundIds = new Set<string>();
/** Sockets that already carry a messages.upsert listener (attach once each). */
const inboundBound = new WeakSet<WASocket>();

/** Record an outbound send so the inbound handler can recognise + skip it. */
function rememberSent(id: string | null | undefined, text: string): void {
  if (id) {
    if (sentIds.size > 500) sentIds.clear();
    sentIds.add(id);
  }
  if (sentTexts.size > 200) sentTexts.clear();
  sentTexts.add(text);
}

// ---------------------------------------------------------------------------
// Pure, dependency-free helpers (unit-tested in test/whatsapp.test.ts)
// ---------------------------------------------------------------------------

/** A userId is safe to use as a single path segment / DB key. */
export const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Guard a userId before it is ever used to key auth state. Rejects anything
 * that is not a flat `[A-Za-z0-9_-]+` token — in particular `.`, `..`, `/`,
 * `\`, null bytes and whitespace. Returns the id for chaining.
 */
export function assertSafeUserId(userId: string): string {
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 128) {
    throw new Error("invalid userId");
  }
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("invalid userId");
  }
  return userId;
}

/** Digits-only view of a phone number: strips spaces, punctuation, "+", leading zeros. */
export function normalizeNumber(input: string): string {
  return String(input ?? "")
    .replace(/[^0-9]/g, "")
    .replace(/^0+/, "");
}

/**
 * Build a WhatsApp user JID. Accepts a raw number ("+1 415 555 0100") or an
 * existing JID (device suffix like ":6" is dropped). Throws on empty / non-numeric
 * input so callers can surface a clean error instead of sending to a bad address.
 */
export function toJid(numberOrJid: string): string {
  const s = String(numberOrJid ?? "").trim();
  if (!s) throw new Error("empty WhatsApp number");
  if (s.includes("@")) {
    return s.toLowerCase().replace(/:\d+(?=@)/, "");
  }
  const digits = normalizeNumber(s);
  if (!digits) throw new Error(`not a valid WhatsApp number: ${numberOrJid}`);
  return `${digits}@s.whatsapp.net`;
}

/** Extract the digits from a JID (or null if there are none). */
export function jidToDigits(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const local = String(jid).split("@")[0]?.split(":")[0] ?? "";
  const digits = local.replace(/[^0-9]/g, "");
  return digits || null;
}

// ---------------------------------------------------------------------------

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

async function getEntry(userId: string): Promise<UserWA> {
  assertSafeUserId(userId);
  let e = reg.get(userId);
  if (!e) {
    const linked = await hasDbAuthState(userId);
    e = { status: linked ? "connecting" : "unpaired" };
    reg.set(userId, e);
  }
  return e;
}

/** Baileys `DisconnectReason.connectionReplaced` — another client took the session. */
const CONNECTION_REPLACED = 440;

function scheduleReconnect(userId: string, e: UserWA, code?: number): void {
  // One pending reconnect at a time — a live socket, an in-flight connect, or an
  // already-scheduled timer all mean "do nothing". This is the guard that keeps a
  // close event from fanning out into a storm of parallel sockets.
  if (e.unlinked || e.sock || e.starting || e.reconnectTimer || e.status === "connected") return;

  const attempt = (e.retries = (e.retries ?? 0) + 1);
  if (attempt > 8) {
    // Give up for now; the 10-minute tick calls connectUser() fresh and resets this.
    console.warn(`[whatsapp] ${userId}: ${attempt} reconnects — backing off until next tick`);
    e.retries = 0;
    return;
  }
  // A "replaced" (440) means two clients are fighting over the session; back off
  // hard and jitter so they don't ping-pong. Ordinary drops retry quickly.
  const base = code === CONNECTION_REPLACED ? 45_000 : 2_000;
  const delay =
    Math.min(120_000, base * 2 ** Math.min(attempt - 1, 5)) + Math.floor(Math.random() * 5_000);

  const timer = setTimeout(() => {
    e.reconnectTimer = undefined;
    if (e.unlinked || reg.get(userId) !== e) return;
    if (e.sock || e.starting || e.status === "connected") return;
    void connectUser(userId).catch((err) =>
      console.error(`[whatsapp] reconnect failed for ${userId}:`, err),
    );
  }, delay);
  timer.unref?.();
  e.reconnectTimer = timer;
}

/**
 * Wire the user's WhatsApp self-chat as a two-way command surface: an inbound
 * text becomes a `runWhatsAppTurn()` turn — which answers questions AND carries
 * out actions (e.g. creating a calendar event), replying with a confirmation.
 * Attached once per socket; every failure is swallowed so a bad message can
 * never take the connection down.
 */
function attachInboundHandler(userId: string, e: UserWA, sock: WASocket): void {
  if (inboundBound.has(sock)) return;
  inboundBound.add(sock);

  sock.ev.on("messages.upsert", (up) => {
    // Only live pushes — "append" / history replay would answer stale messages.
    if (up.type !== "notify") return;
    void (async () => {
      for (const m of up.messages) {
        try {
          await handleInboundMessage(userId, e, sock, m);
        } catch (err) {
          console.error(`[whatsapp] inbound handler error for ${userId}:`, err);
        }
      }
    })();
  });
}

async function handleInboundMessage(
  userId: string,
  e: UserWA,
  sock: WASocket,
  m: WAMessage,
): Promise<void> {
  const remoteJid = m.key?.remoteJid;
  // selfJid is only set on connection "open"; nothing to compare against yet.
  if (!remoteJid || !e.selfJid) return;
  // Only the user's OWN self-chat is a Kora surface — ignore every other thread.
  if (jidNormalizedUser(remoteJid) !== e.selfJid) return;

  // Recency window only: ignore messages older than 10 minutes so a brief
  // spin-down + reconnect still gets answered. Per-id dedupe (below) is the
  // real replay guard. (messageTimestamp is seconds; Long has a valueOf so
  // Number() handles both shapes.)
  const ts = Number(m.messageTimestamp ?? 0);
  if (ts && ts < Math.floor(Date.now() / 1000) - 600) return;

  // Loop prevention: Kora's own replies arrive here too (fromMe, same chat).
  const id = m.key?.id ?? undefined;
  if (id && sentIds.has(id)) return;
  // Replay guard: never handle the same inbound id twice (reconnect redelivery).
  if (id && seenInboundIds.has(id)) return;

  const text = (
    m.message?.conversation ??
    m.message?.extendedTextMessage?.text ??
    ""
  ).trim();
  if (!text) return;
  if (sentTexts.has(text)) return; // defensive: exact echo of something we sent

  // An agent turn can take ~30s — one turn per user at a time. Tell the user
  // we're busy (audible) rather than dropping silently, so they know to resend.
  if (handling.has(userId)) {
    await sendToUser(
      userId,
      "⏳ Still working on your previous message — one sec.",
    ).catch(() => {});
    return;
  }
  handling.add(userId);
  if (id) {
    if (seenInboundIds.size > 500) seenInboundIds.clear();
    seenInboundIds.add(id);
  }
  try {
    try {
      await sock.sendPresenceUpdate("composing", remoteJid);
    } catch {
      /* presence is cosmetic */
    }
    const reply = await runWhatsAppTurn(userId, text);
    await sendToUser(userId, reply);
  } catch (err) {
    console.error(`[whatsapp] runWhatsAppTurn failed for ${userId}:`, err);
    await sendToUser(
      userId,
      "Sorry — I hit an error handling that. Try again in a moment.",
    ).catch(() => {});
  } finally {
    handling.delete(userId);
  }
}

/**
 * Per-user single-flight for socket creation. EVERY path that opens a socket
 * (pairing, tick keep-alive, getState self-heal, scheduleReconnect) funnels
 * through `connectUser`, and this chain guarantees the bodies never overlap for
 * the same user — the root cause of the earlier "conflict / replaced" storm was
 * two `makeWASocket` calls racing for one linked device.
 */
const connectChain = new Map<string, Promise<UserWA>>();

/** Spin up (or reuse) a socket for this user. Resolves once it's open OR a QR is ready. */
export async function connectUser(userId: string): Promise<UserWA> {
  assertSafeUserId(userId);
  const prev = connectChain.get(userId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => connectUserInner(userId));
  connectChain.set(userId, next);
  try {
    return await next;
  } finally {
    if (connectChain.get(userId) === next) connectChain.delete(userId);
  }
}

/** Fully drop a socket: kill its listeners and its WebSocket so WhatsApp stops
 *  counting it as a live connection for the device. */
function teardownSocket(e: UserWA): void {
  const s = e.sock;
  e.sock = undefined;
  if (!s) return;
  try {
    s.ev.removeAllListeners("connection.update");
    s.ev.removeAllListeners("creds.update");
    s.ev.removeAllListeners("messages.upsert");
  } catch {
    /* ignore */
  }
  try {
    s.end(undefined);
  } catch {
    /* ignore */
  }
}

async function connectUserInner(userId: string): Promise<UserWA> {
  const e = await getEntry(userId);
  e.unlinked = false;

  // Healthy socket already — reuse it.
  if (e.sock && (e.status === "connected" || e.status === "qr")) return e;

  // Any prior socket must be gone before we open a new one (two live sockets for
  // one device => WhatsApp evicts one with a 440 "replaced", which used to kick
  // off an endless reconnect war).
  teardownSocket(e);
  if (e.reconnectTimer) {
    clearTimeout(e.reconnectTimer);
    e.reconnectTimer = undefined;
  }

  const done = { flag: false };
  const started = (async () => {
    const { state, saveCreds } = await useDbAuthState(userId);

    let version: [number, number, number] | undefined;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // offline / rate-limited — fall back to the bundled version
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });
    e.sock = sock;
    e.socketStartedAt = Math.floor(Date.now() / 1000);
    if (e.status !== "qr") e.status = "connecting";
    console.info(
      `[whatsapp] socket created for ${userId} (version=${version ? version.join(".") : "bundled"})`,
    );

    sock.ev.on("creds.update", saveCreds);
    attachInboundHandler(userId, e, sock);
    attachConnectionHandler(userId, e, sock);
  })();

  try {
    await started;
  } catch (error) {
    teardownSocket(e);
    e.lastError = error instanceof Error ? error.message : String(error);
    console.error(`[whatsapp] setup failed for ${userId}:`, error);
    e.status = (await hasDbAuthState(userId)) ? "connecting" : "unpaired";
    throw error;
  }

  // Wait for the first decisive connection event (or the timeout) before
  // returning, so `startPairing` can hand back a QR immediately.
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      if (done.flag) return;
      done.flag = true;
      clearTimeout(timer);
      e.sock?.ev.off("connection.update", onUpdate);
      resolve();
    };
    const timer = setTimeout(finish, CONNECT_WAIT_MS);
    const onUpdate = (u: {
      connection?: string;
      qr?: string;
    }): void => {
      if (u.qr || u.connection === "open" || u.connection === "close") finish();
    };
    e.sock?.ev.on("connection.update", onUpdate);
  });

  return e;
}

/**
 * Ongoing per-socket lifecycle: promote to "connected" on open, and on an
 * unexpected close either clear the session (logged out) or schedule a single
 * guarded reconnect. Stale invocations (a newer socket already owns `e`) no-op.
 */
function attachConnectionHandler(userId: string, e: UserWA, sock: WASocket): void {
  sock.ev.on("connection.update", (u) => {
    if (e.sock !== sock || e.unlinked) return; // superseded / unlinked
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.info(`[whatsapp] qr received for ${userId}`);
      e.qr = qr;
      e.status = "qr";
    }

    if (connection === "open") {
      console.info(`[whatsapp] connection open for ${userId}`);
      e.qr = undefined;
      e.status = "connected";
      e.lastError = undefined;
      e.selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
      const digits = jidToDigits(e.selfJid);
      if (digits && !e.unlinked) {
        prisma.user
          .update({ where: { id: userId }, data: { whatsappJid: digits } })
          .catch((err) => console.error("[whatsapp] persist number failed", err));
      }
      // Only clear the backoff once the link has held for a bit — otherwise an
      // open→close flap resets it every cycle and never actually backs off.
      const stable = setTimeout(() => {
        if (e.sock === sock && e.status === "connected") e.retries = 0;
      }, 20_000);
      stable.unref?.();
    }

    if (connection === "close") {
      const code = (
        lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      console.error(
        `[whatsapp] connection close for ${userId} (code=${code ?? "?"}): ${
          lastDisconnect?.error instanceof Error
            ? lastDisconnect.error.message
            : String(lastDisconnect?.error ?? "")
        }`,
      );
      if (e.sock === sock) e.sock = undefined;
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("messages.upsert");
      } catch {
        /* ignore */
      }

      if (code === DisconnectReason.loggedOut) {
        e.status = "unpaired";
        e.qr = undefined;
        e.selfJid = undefined;
        void clearDbAuthState(userId).catch(() => {});
        return;
      }
      void hasDbAuthState(userId).then((linked) => {
        e.status = linked ? "connecting" : "unpaired";
        if (linked && !e.unlinked) scheduleReconnect(userId, e, code);
      });
    }
  });
}

export async function getState(userId: string): Promise<{ status: WAStatus; qr?: string; number?: string }> {
  const e = await getEntry(userId);

  // Self-heal: a linked user whose in-memory socket died (process restart,
  // Render free-tier spin-down, etc.) shows "connecting" until someone
  // re-triggers a connection. Kick one off in the background — throttled so a
  // fast-polling dashboard can't spawn a reconnect storm. `connectUser` is
  // single-flighted, so an overlapping call here is a harmless no-op.
  if (
    e.status === "connecting" &&
    !e.sock &&
    !connectChain.has(userId) &&
    !e.reconnectTimer &&
    !e.unlinked
  ) {
    const now = Date.now();
    if (!e.nextRetryAt || e.nextRetryAt <= now) {
      e.nextRetryAt = now + SELF_HEAL_COOLDOWN_MS;
      void connectUser(userId).catch((err) =>
        console.error(`[whatsapp] background reconnect failed for ${userId}:`, err),
      );
    }
  }

  return {
    status: e.status,
    qr: e.status === "qr" ? e.qr : undefined,
    number: jidToDigits(e.selfJid) ?? undefined,
  };
}

/**
 * Gentle periodic nudge (called by the cron tick). Unlike `connectUser` it never
 * pre-empts an active reconnect backoff — it only re-establishes a socket for a
 * linked user who is genuinely idle (no socket, no pending retry, not mid-connect).
 */
export async function keepAlive(userId: string): Promise<void> {
  assertSafeUserId(userId);
  const e = reg.get(userId);
  if (e) {
    if (e.sock && e.status === "connected") return; // healthy
    if (e.reconnectTimer || connectChain.has(userId) || e.unlinked) return; // already in hand
  }
  await connectUser(userId).catch((err) =>
    console.error(`[whatsapp] keepAlive failed for ${userId}:`, err),
  );
}

/** Begin (or continue) a pairing attempt; returns as soon as a QR or connection is ready. */
export async function startPairing(userId: string): Promise<{ status: WAStatus; qr?: string }> {
  const e = await connectUser(userId);
  return { status: e.status, qr: e.status === "qr" ? e.qr : undefined };
}

export async function unlink(userId: string): Promise<void> {
  assertSafeUserId(userId);
  const e = reg.get(userId);
  if (e) {
    // Stop any in-flight connect / scheduled reconnect from resurrecting this user.
    e.unlinked = true;
    if (e.reconnectTimer) {
      clearTimeout(e.reconnectTimer);
      e.reconnectTimer = undefined;
    }
    connectChain.delete(userId);
    const sock = e.sock;
    e.sock = undefined;
    e.starting = undefined;
    e.status = "unpaired";
    e.qr = undefined;
    e.selfJid = undefined;
    try {
      sock?.ev.removeAllListeners("connection.update");
    } catch {
      /* ignore */
    }
    try {
      await sock?.logout();
    } catch {
      /* offline / already gone */
    }
    try {
      sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
  }
  reg.delete(userId);
  await clearDbAuthState(userId);
  await prisma.user.update({ where: { id: userId }, data: { whatsappJid: null } }).catch(() => {});
}

/** Send text to the user's own WhatsApp (self-chat). Reconnects on demand. */
export async function sendToUser(userId: string, text: string): Promise<void> {
  assertSafeUserId(userId);
  if (!isWhatsAppEnabled()) {
    console.warn("[whatsapp] WHATSAPP_ENABLED != true — skipping send");
    return;
  }
  let e = await getEntry(userId);
  if (!e.sock || e.status !== "connected") {
    if (!(await hasDbAuthState(userId))) {
      throw new Error("WhatsApp not linked for this user");
    }
    e = await connectUser(userId);
  }
  if (e.status !== "connected" || !e.sock || !e.selfJid) {
    throw new Error(`WhatsApp not connected (status: ${e.status})`);
  }
  const r = await e.sock.sendMessage(e.selfJid, { text });
  // Remember what we sent so the inbound handler skips our own echo (fromMe).
  rememberSent(r?.key?.id, text);
}

export async function isLinked(userId: string): Promise<boolean> {
  try {
    return await hasDbAuthState(userId);
  } catch {
    return false;
  }
}

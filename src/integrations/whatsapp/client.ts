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
import { handleChat } from "@/agent/chat";

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
  starting?: Promise<void>;
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

function scheduleReconnect(userId: string, e: UserWA): void {
  if (e.unlinked) return;
  const attempt = (e.retries = (e.retries ?? 0) + 1);
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
  setTimeout(() => {
    if (e.unlinked || reg.get(userId) !== e) return;
    if (e.sock || e.starting || e.status === "connected") return;
    void connectUser(userId).catch((err) =>
      console.error(`[whatsapp] reconnect failed for ${userId}:`, err),
    );
  }, delay);
}

/**
 * Wire the user's WhatsApp self-chat as a two-way "Ask Kora" surface: an inbound
 * text becomes a `handleChat()` turn and the answer is sent straight back.
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

  // Ignore anything from before this socket started so a reconnect doesn't
  // replay + re-answer an old backlog. (messageTimestamp is seconds; Long has
  // a valueOf so Number() handles both shapes.)
  const ts = Number(m.messageTimestamp ?? 0);
  if (e.socketStartedAt && ts && ts < e.socketStartedAt) return;

  // Loop prevention: Kora's own replies arrive here too (fromMe, same chat).
  const id = m.key?.id ?? undefined;
  if (id && sentIds.has(id)) return;

  const text = (
    m.message?.conversation ??
    m.message?.extendedTextMessage?.text ??
    ""
  ).trim();
  if (!text) return;
  if (sentTexts.has(text)) return; // defensive: exact echo of something we sent

  // handleChat is slow relative to WhatsApp delivery — one turn per user at a
  // time; drop (with a log) rather than queue so we can't pile up.
  if (handling.has(userId)) {
    console.warn(`[whatsapp] busy — dropping inbound for ${userId}: ${text.slice(0, 60)}`);
    return;
  }
  handling.add(userId);
  try {
    try {
      await sock.sendPresenceUpdate("composing", remoteJid);
    } catch {
      /* presence is cosmetic */
    }
    const res = await handleChat(userId, text);
    await sendToUser(userId, res.reply);
  } catch (err) {
    console.error(`[whatsapp] handleChat failed for ${userId}:`, err);
    await sendToUser(
      userId,
      "Sorry — I hit an error handling that. Try again in a moment.",
    ).catch(() => {});
  } finally {
    handling.delete(userId);
  }
}

/** Spin up (or reuse) a socket for this user. Resolves once it's open OR a QR is ready. */
export async function connectUser(userId: string): Promise<UserWA> {
  const e = await getEntry(userId);
  e.unlinked = false;

  // A live socket already exists (connected, or mid-pairing with a QR shown) —
  // never open a second one for the same user.
  if (e.sock && (e.status === "connected" || e.status === "qr")) return e;
  // A start is already in flight (possibly mid-QR) — join it, don't race a 2nd socket.
  if (e.starting) {
    await e.starting;
    return e;
  }

  e.starting = (async () => {
    let sock: WASocket | undefined;
    try {
      const { state, saveCreds } = await useDbAuthState(userId);

      let version: [number, number, number] | undefined;
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch {
        version = undefined; // offline / rate-limited — fall back to Baileys' bundled version
      }

      sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger,
        printQRInTerminal: false,
      });
      e.sock = sock;
      e.socketStartedAt = Math.floor(Date.now() / 1000);
      console.info(`[whatsapp] socket created for ${userId} (version=${version ? version.join(".") : "bundled"})`);
      if (e.status !== "qr") e.status = "connecting";
      sock.ev.on("creds.update", saveCreds);
      // Inbound side of the channel — makes the self-chat a two-way "Ask Kora".
      attachInboundHandler(userId, e, sock);

      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        // Never hang the caller: if nothing happens, return with whatever state we have.
        const timer = setTimeout(done, CONNECT_WAIT_MS);

        sock!.ev.on("connection.update", (u) => {
          if (e.unlinked) return;
          const { connection, lastDisconnect, qr } = u;
          if (qr) {
            console.info(`[whatsapp] qr received for ${userId}`);
            e.qr = qr;
            e.status = "qr";
            done(); // caller can now show the QR
          }
          if (connection === "open") {
            console.info(`[whatsapp] connection open for ${userId}`);
            e.qr = undefined;
            e.status = "connected";
            e.retries = 0;
            e.lastError = undefined;
            e.selfJid = sock!.user?.id ? jidNormalizedUser(sock!.user.id) : undefined;
            const digits = jidToDigits(e.selfJid);
            if (digits && !e.unlinked) {
              prisma.user
                .update({ where: { id: userId }, data: { whatsappJid: digits } })
                .catch((err) => console.error("[whatsapp] persist number failed", err));
            }
            done();
          }
          if (connection === "close") {
            const code = (
              lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
            )?.output?.statusCode;
            console.error(
              `[whatsapp] connection close for ${userId} (code=${code ?? "?"}):`,
              lastDisconnect?.error,
            );
            e.sock = undefined;
            e.starting = undefined;
            if (code === DisconnectReason.loggedOut) {
              e.status = "unpaired";
              e.qr = undefined;
              e.selfJid = undefined;
              void clearDbAuthState(userId).catch(() => {});
              done();
            } else {
              // 515 restart-required (normal right after linking), network blips,
              // Render spin-down resume, etc. — reconnect with backoff so a linked
              // user is never permanently stuck "connecting".
              void hasDbAuthState(userId).then((linked) => {
                e.status = linked ? "connecting" : "unpaired";
                if (e.status === "connecting") scheduleReconnect(userId, e);
                done();
              });
            }
          }
        });
      });
    } catch (error) {
      try {
        sock?.end?.(undefined);
      } catch {
        /* ignore */
      }
      e.sock = undefined;
      e.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[whatsapp] setup failed for ${userId}:`, error);
      e.status = (await hasDbAuthState(userId)) ? "connecting" : "unpaired";
      throw error;
    }
  })();

  try {
    await e.starting;
  } finally {
    e.starting = undefined;
  }
  return e;
}

export async function getState(userId: string): Promise<{ status: WAStatus; qr?: string; number?: string }> {
  const e = await getEntry(userId);

  // Self-heal: a linked user whose in-memory socket died (process restart,
  // Render free-tier spin-down, etc.) shows "connecting" until someone
  // re-triggers a connection. Kick one off in the background — throttled so a
  // fast-polling dashboard can't spawn a reconnect storm.
  if (e.status === "connecting" && !e.sock && !e.starting && !e.unlinked) {
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

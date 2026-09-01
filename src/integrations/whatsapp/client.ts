/**
 * Multi-tenant WhatsApp channel via Baileys.
 *
 * Each user links their OWN WhatsApp from the dashboard (scan a QR → "Linked
 * devices"). The system then messages them on their own number (self-chat).
 * Auth state is per-user under WHATSAPP_AUTH_DIR/<userId>/.
 *
 * Sockets are long-lived and in-process — this works on a persistent Node server
 * (local `npm run dev`, a VPS, Railway/Render) but NOT on Vercel serverless:
 * a function is frozen after it responds and `/tmp` is ephemeral, so a QR shows
 * but pairing never completes. Host the app (or at least these routes + the
 * worker) on a persistent process for WhatsApp to work. See DEPLOY.md §4.
 */
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  jidNormalizedUser,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { prisma } from "@/lib/db";

const AUTH_ROOT = process.env.WHATSAPP_AUTH_DIR || ".wa-auth";
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "silent" });

/** Time we wait for a socket to reach "open" or produce a QR before returning. */
const CONNECT_WAIT_MS = 20_000;
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
}

/**
 * Module-level registry, keyed strictly by userId. Every value is a distinct
 * object; nothing here is ever shared between users. All public entry points
 * validate the userId first (see assertSafeUserId) so one user can neither read
 * another user's auth dir nor address another user's entry.
 */
const reg = new Map<string, UserWA>();

// ---------------------------------------------------------------------------
// Pure, dependency-free helpers (unit-tested in test/whatsapp.test.ts)
// ---------------------------------------------------------------------------

/** A userId is safe to use as a single path segment. */
export const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Guard a userId before it is ever turned into a filesystem path. Rejects
 * anything that is not a flat `[A-Za-z0-9_-]+` token — in particular `.`, `..`,
 * `/`, `\`, null bytes and whitespace — so path traversal into another user's
 * (or an arbitrary) directory is impossible. Returns the id for chaining.
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

/** Per-user auth directory. Validates the userId first. */
export function authDir(userId: string): string {
  return path.join(AUTH_ROOT, assertSafeUserId(userId));
}

// ---------------------------------------------------------------------------

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

function credsExist(userId: string): boolean {
  return existsSync(path.join(authDir(userId), "creds.json"));
}

function entry(userId: string): UserWA {
  assertSafeUserId(userId);
  let e = reg.get(userId);
  if (!e) {
    e = { status: credsExist(userId) ? "connecting" : "unpaired" };
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

/** Spin up (or reuse) a socket for this user. Resolves once it's open OR a QR is ready. */
export async function connectUser(userId: string): Promise<UserWA> {
  const e = entry(userId);
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
      const { state, saveCreds } = await useMultiFileAuthState(authDir(userId));

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
      if (e.status !== "qr") e.status = "connecting";
      sock.ev.on("creds.update", saveCreds);

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
            e.qr = qr;
            e.status = "qr";
            done(); // caller can now show the QR
          }
          if (connection === "open") {
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
            e.sock = undefined;
            e.starting = undefined;
            if (code === DisconnectReason.loggedOut) {
              e.status = "unpaired";
              e.qr = undefined;
              e.selfJid = undefined;
              void rm(authDir(userId), { recursive: true, force: true }).catch(() => {});
            } else {
              // 515 restart-required (normal right after linking), network blips,
              // Render spin-down resume, etc. — reconnect with backoff so a linked
              // user is never permanently stuck "connecting".
              e.status = credsExist(userId) ? "connecting" : "unpaired";
              if (e.status === "connecting") scheduleReconnect(userId, e);
            }
            done();
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
      e.status = credsExist(userId) ? "connecting" : "unpaired";
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

export function getState(userId: string): { status: WAStatus; qr?: string; number?: string } {
  const e = entry(userId);

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
  await rm(authDir(userId), { recursive: true, force: true }).catch(() => {});
  await prisma.user.update({ where: { id: userId }, data: { whatsappJid: null } }).catch(() => {});
}

/** Send text to the user's own WhatsApp (self-chat). Reconnects on demand. */
export async function sendToUser(userId: string, text: string): Promise<void> {
  assertSafeUserId(userId);
  if (!isWhatsAppEnabled()) {
    console.warn("[whatsapp] WHATSAPP_ENABLED != true — skipping send");
    return;
  }
  let e = entry(userId);
  if (!e.sock || e.status !== "connected") {
    if (!credsExist(userId)) {
      throw new Error("WhatsApp not linked for this user");
    }
    e = await connectUser(userId);
  }
  if (e.status !== "connected" || !e.sock || !e.selfJid) {
    throw new Error(`WhatsApp not connected (status: ${e.status})`);
  }
  await e.sock.sendMessage(e.selfJid, { text });
}

export function isLinked(userId: string): boolean {
  try {
    return credsExist(userId);
  } catch {
    return false;
  }
}

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

export type WAStatus = "unpaired" | "qr" | "connecting" | "connected";

interface UserWA {
  sock?: WASocket;
  status: WAStatus;
  qr?: string;
  selfJid?: string;
  starting?: Promise<void>;
}

const reg = new Map<string, UserWA>();

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

function authDir(userId: string): string {
  return path.join(AUTH_ROOT, userId);
}
function entry(userId: string): UserWA {
  let e = reg.get(userId);
  if (!e) {
    e = { status: existsSync(path.join(authDir(userId), "creds.json")) ? "connecting" : "unpaired" };
    reg.set(userId, e);
  }
  return e;
}

/** Spin up (or reuse) a socket for this user. Resolves once it's open OR a QR is ready. */
export async function connectUser(userId: string): Promise<UserWA> {
  const e = entry(userId);
  if (e.sock && e.status === "connected") return e;
  if (e.starting) {
    await e.starting;
    return e;
  }

  e.starting = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(authDir(userId));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false });
    e.sock = sock;
    e.status = "connecting";
    sock.ev.on("creds.update", saveCreds);

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) {
          e.qr = qr;
          e.status = "qr";
          done(); // caller can now show the QR
        }
        if (connection === "open") {
          e.qr = undefined;
          e.status = "connected";
          e.selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
          if (e.selfJid) {
            const digits = e.selfJid.split("@")[0]?.replace(/\D/g, "") ?? null;
            if (digits) {
              prisma.user
                .update({ where: { id: userId }, data: { whatsappJid: digits } })
                .catch((err) => console.error("[whatsapp] persist number failed", err));
            }
          }
          done();
        }
        if (connection === "close") {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
            ?.output?.statusCode;
          e.sock = undefined;
          e.starting = undefined;
          if (code === DisconnectReason.loggedOut) {
            e.status = "unpaired";
            void rm(authDir(userId), { recursive: true, force: true });
          } else {
            e.status = existsSync(path.join(authDir(userId), "creds.json"))
              ? "connecting"
              : "unpaired";
          }
          done();
        }
      });
    });
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
  return {
    status: e.status,
    qr: e.status === "qr" ? e.qr : undefined,
    number: e.selfJid?.split("@")[0],
  };
}

/** Begin (or continue) a pairing attempt; returns as soon as a QR or connection is ready. */
export async function startPairing(userId: string): Promise<{ status: WAStatus; qr?: string }> {
  const e = await connectUser(userId);
  return { status: e.status, qr: e.status === "qr" ? e.qr : undefined };
}

export async function unlink(userId: string): Promise<void> {
  const e = reg.get(userId);
  try {
    await e?.sock?.logout();
  } catch {
    /* ignore */
  }
  reg.delete(userId);
  await rm(authDir(userId), { recursive: true, force: true });
  await prisma.user.update({ where: { id: userId }, data: { whatsappJid: null } }).catch(() => {});
}

/** Send text to the user's own WhatsApp (self-chat). Reconnects on demand. */
export async function sendToUser(userId: string, text: string): Promise<void> {
  if (!isWhatsAppEnabled()) {
    console.warn("[whatsapp] WHATSAPP_ENABLED != true — skipping send");
    return;
  }
  let e = entry(userId);
  if (!e.sock || e.status !== "connected") {
    if (!existsSync(path.join(authDir(userId), "creds.json"))) {
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
  return existsSync(path.join(authDir(userId), "creds.json"));
}

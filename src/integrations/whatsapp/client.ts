/**
 * WhatsApp channel via Baileys (unofficial WhatsApp Web multi-device).
 *
 * IMPORTANT: this is an unofficial library. Use a number you don't mind risking;
 * WhatsApp may rate-limit or ban numbers that look automated. It needs a one-time
 * QR pairing (`npm run wa:pair`) and a long-lived socket — it runs on the worker
 * process, never in a Vercel serverless function.
 */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || ".wa-auth";
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "silent" });

let sockPromise: Promise<WASocket> | null = null;

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

/** `919812345678` or `+91 98123 45678` → `919812345678@s.whatsapp.net`. */
export function toJid(numberOrJid: string): string {
  if (numberOrJid.includes("@")) return numberOrJid;
  const digits = numberOrJid.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

/**
 * Returns a connected socket, (re)connecting as needed. On first run with no
 * saved credentials it prints a QR code to the terminal — scan it from
 * WhatsApp → Linked devices.
 */
export function getSocket(opts: { showQr?: boolean } = {}): Promise<WASocket> {
  if (sockPromise) return sockPromise;

  sockPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false });
    sock.ev.on("creds.update", saveCreds);

    await new Promise<void>((resolve, reject) => {
      sock.ev.on("connection.update", (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr && (opts.showQr ?? true)) {
          console.log("\nScan this in WhatsApp → Settings → Linked devices → Link a device:\n");
          qrcode.generate(qr, { small: true });
        }
        if (connection === "open") {
          console.log("[whatsapp] connected");
          resolve();
        }
        if (connection === "close") {
          const code = (
            lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          sockPromise = null;
          if (code === DisconnectReason.loggedOut) {
            reject(new Error("WhatsApp logged out — delete the auth dir and re-pair (npm run wa:pair)"));
          } else {
            reject(new Error(`WhatsApp connection closed (code ${code ?? "?"}) — will retry on next call`));
          }
        }
      });
    });

    return sock;
  })();

  // If connecting fails, don't cache the rejected promise.
  sockPromise.catch(() => {
    sockPromise = null;
  });

  return sockPromise;
}

export async function sendText(numberOrJid: string, text: string): Promise<void> {
  if (!isWhatsAppEnabled()) {
    console.warn("[whatsapp] WHATSAPP_ENABLED != true — skipping send");
    return;
  }
  const sock = await getSocket({ showQr: false });
  await sock.sendMessage(toJid(numberOrJid), { text });
}

/** For the pairing script — connects, shows the QR, waits, then exits. */
export async function pair(): Promise<void> {
  await getSocket({ showQr: true });
  console.log("[whatsapp] paired. Credentials saved to", AUTH_DIR);
}

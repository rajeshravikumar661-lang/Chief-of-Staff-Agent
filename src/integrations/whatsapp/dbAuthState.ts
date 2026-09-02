/**
 * Postgres-backed Baileys auth state — a drop-in replacement for
 * `useMultiFileAuthState` (see Baileys' own use-multi-file-auth-state.js,
 * which this mirrors exactly) that stores creds/keys as rows instead of
 * files. This is what makes a linked WhatsApp session survive redeploys and
 * host restarts on ANY platform — including hosts with no persistent disk
 * (Vercel's /tmp, Render's free tier) — since it rides on the same Postgres
 * database everything else in the app already depends on.
 */
import { proto } from "@whiskeysockets/baileys";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/db";

async function readCreds(userId: string): Promise<AuthenticationCreds | null> {
  const row = await prisma.whatsAppAuthCreds.findUnique({ where: { userId } });
  if (!row) return null;
  return JSON.parse(row.data, BufferJSON.reviver);
}

async function writeCreds(userId: string, creds: AuthenticationCreds): Promise<void> {
  const data = JSON.stringify(creds, BufferJSON.replacer);
  await prisma.whatsAppAuthCreds.upsert({
    where: { userId },
    create: { userId, data },
    update: { data },
  });
}

async function readKey(userId: string, keyId: string): Promise<unknown | null> {
  const row = await prisma.whatsAppAuthKey.findUnique({ where: { userId_keyId: { userId, keyId } } });
  if (!row) return null;
  return JSON.parse(row.data, BufferJSON.reviver);
}

async function writeKey(userId: string, keyId: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value, BufferJSON.replacer);
  await prisma.whatsAppAuthKey.upsert({
    where: { userId_keyId: { userId, keyId } },
    create: { userId, keyId, data },
    update: { data },
  });
}

async function removeKey(userId: string, keyId: string): Promise<void> {
  await prisma.whatsAppAuthKey.delete({ where: { userId_keyId: { userId, keyId } } }).catch(() => {
    /* already gone */
  });
}

/** True if this user has a linked (or in-progress) WhatsApp session persisted in the DB. */
export async function hasDbAuthState(userId: string): Promise<boolean> {
  const row = await prisma.whatsAppAuthCreds.findUnique({ where: { userId }, select: { userId: true } });
  return row !== null;
}

export async function clearDbAuthState(userId: string): Promise<void> {
  await prisma.whatsAppAuthKey.deleteMany({ where: { userId } });
  await prisma.whatsAppAuthCreds.deleteMany({ where: { userId } });
}

export async function useDbAuthState(userId: string) {
  const creds = (await readCreds(userId)) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readKey(userId, `${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
              }
              if (value) data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (data: { [K in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[K] | null } }) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap];
            if (!entries) continue;
            for (const id in entries) {
              const value = entries[id];
              const keyId = `${category}-${id}`;
              tasks.push(value ? writeKey(userId, keyId, value) : removeKey(userId, keyId));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeCreds(userId, creds),
  };
}

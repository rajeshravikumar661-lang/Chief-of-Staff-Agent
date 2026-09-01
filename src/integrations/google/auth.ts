import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  decryptToken,
  decryptTokenOrNull,
  encryptToken,
} from "@/security/tokenCrypto";

export class ConnectionMissingError extends Error {
  constructor(provider: string) {
    super(`No connected '${provider}' account for this user`);
  }
}

/**
 * Returns an authenticated Google OAuth2 client for one of the Google-family
 * connectors (gmail | calendar | drive). Handles token decrypt + auto-refresh,
 * persisting refreshed tokens back to the Connection row (re-encrypted).
 * The agent never touches this directly — only the connector tools do (spec §7).
 */
export async function getGoogleClient(
  userId: string,
  provider: "gmail" | "calendar" | "drive",
): Promise<OAuth2Client> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!conn || conn.status !== "connected" || !conn.accessTokenEncrypted) {
    throw new ConnectionMissingError(provider);
  }

  const client = new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
  );
  client.setCredentials({
    access_token: decryptToken(conn.accessTokenEncrypted),
    refresh_token: decryptTokenOrNull(conn.refreshTokenEncrypted) ?? undefined,
    expiry_date: conn.expiresAt ? conn.expiresAt.getTime() : undefined,
  });

  client.on("tokens", (tokens) => {
    void (async () => {
      try {
        const data: Record<string, unknown> = {};
        if (tokens.access_token) data.accessTokenEncrypted = encryptToken(tokens.access_token);
        if (tokens.refresh_token) data.refreshTokenEncrypted = encryptToken(tokens.refresh_token);
        if (tokens.expiry_date) data.expiresAt = new Date(tokens.expiry_date);
        if (Object.keys(data).length) {
          await prisma.connection.updateMany({
            where: { userId, provider },
            data,
          });
        }
      } catch (e) {
        console.error("[google/auth] failed to persist refreshed tokens", e);
      }
    })();
  });

  return client;
}

export async function markConnectionError(userId: string, provider: string) {
  await prisma.connection.updateMany({
    where: { userId, provider },
    data: { status: "error" },
  });
}

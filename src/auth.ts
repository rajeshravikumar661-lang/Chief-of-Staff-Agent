import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { encryptTokenOrNull } from "@/security/tokenCrypto";

/**
 * One Google OAuth flow serves both login and the Gmail/Calendar/Drive
 * connectors (spec §2). Least-privilege scopes only (spec §9, milestone 2).
 * `gmail.send` is intentionally omitted until milestone 3 adds the approval gate.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
  // Google Workspace read (Sheets / Docs / Slides)
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/presentations.readonly",
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  secret: env.authSecret(),
  trustHost: true,
  providers: [
    Google({
      clientId: env.googleClientId(),
      clientSecret: env.googleClientSecret(),
      authorization: {
        params: {
          scope: GOOGLE_SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    // First consent — mirror straight away.
    async linkAccount({ user, account }) {
      if (user.id) await mirrorGoogleTokens(user.id, account);
    },
    /**
     * EVERY sign-in re-mirrors the fresh Google tokens into the encrypted
     * Connection rows. `linkAccount` only fires once, so without this a
     * returning user is stuck with tokens that were encrypted under an old
     * TOKEN_ENCRYPTION_KEY (decrypt then throws "Unsupported state…" and every
     * sync fails). Signing in again is the recovery path.
     */
    async signIn({ user, account }) {
      if (user.id && account) await mirrorGoogleTokens(user.id, account);
    },
  },
});

/**
 * Copy the Google OAuth tokens from the adapter's Account into encrypted
 * `Connection` rows the connectors read (spec §5). One consent → gmail +
 * calendar + drive. Also clears a stale `error` status.
 */
async function mirrorGoogleTokens(
  userId: string,
  account: { provider?: string; scope?: string | null; access_token?: string | null; refresh_token?: string | null; expires_at?: number | null; providerAccountId?: string },
): Promise<void> {
  if (account.provider !== "google" || !account.access_token) return;
  const scopes = (account.scope ?? "").split(" ").filter(Boolean);
  const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;

  for (const provider of ["gmail", "calendar", "drive"] as const) {
    const tokenData: Record<string, unknown> = {
      accessTokenEncrypted: encryptTokenOrNull(account.access_token),
      scopes,
      status: "connected" as const,
      expiresAt,
    };
    // Google only returns a refresh_token on the first consent for a client —
    // don't overwrite a good stored one with null on later sign-ins.
    if (account.refresh_token) {
      tokenData.refreshTokenEncrypted = encryptTokenOrNull(account.refresh_token);
    }
    await prisma.connection.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        refreshTokenEncrypted: encryptTokenOrNull(account.refresh_token),
        externalAccountId: account.providerAccountId,
        ...tokenData,
      },
      update: tokenData,
    });
  }
}

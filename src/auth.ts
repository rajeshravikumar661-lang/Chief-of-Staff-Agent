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
    /**
     * Mirror the Google OAuth tokens from the adapter's Account row into
     * encrypted Connection rows the connectors read (spec §5). One consent →
     * gmail + calendar + drive connections.
     */
    async linkAccount({ user, account }) {
      if (account.provider !== "google") return;
      const scopes = (account.scope ?? "").split(" ").filter(Boolean);
      const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
      for (const provider of ["gmail", "calendar", "drive"] as const) {
        await prisma.connection.upsert({
          where: { userId_provider: { userId: user.id!, provider } },
          create: {
            userId: user.id!,
            provider,
            accessTokenEncrypted: encryptTokenOrNull(account.access_token),
            refreshTokenEncrypted: encryptTokenOrNull(account.refresh_token),
            scopes,
            status: "connected",
            externalAccountId: account.providerAccountId,
            expiresAt,
          },
          update: {
            accessTokenEncrypted: encryptTokenOrNull(account.access_token),
            refreshTokenEncrypted: encryptTokenOrNull(account.refresh_token),
            scopes,
            status: "connected",
            expiresAt,
          },
        });
      }
    },
  },
});

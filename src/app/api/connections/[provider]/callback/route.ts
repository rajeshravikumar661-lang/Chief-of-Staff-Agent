import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isResponse, requireUser } from "@/lib/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { encryptTokenOrNull } from "@/security/tokenCrypto";
import { logAction } from "@/security/auditLog";
import { OAUTH_M6_PROVIDERS } from "@/app/api/_shared";
import { OAUTH_STATE_COOKIE, verifyState } from "@/lib/oauthState";

export const dynamic = "force-dynamic";

type M6Provider = (typeof OAUTH_M6_PROVIDERS)[number];

function isM6Provider(p: string): p is M6Provider {
  return (OAUTH_M6_PROVIDERS as readonly string[]).includes(p);
}

/* ------------------------------ small helpers ------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickString(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return str(cur);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function redirect(path: string): NextResponse {
  const res = NextResponse.redirect(`${env.appBaseUrl()}${path}`, 302);
  // one-shot cookie: clear it whatever the outcome
  res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/* --------------------------- token exchange --------------------------- */

interface ExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  externalAccountId: string | null;
  expiresAt: Date | null;
}

async function exchange(
  provider: M6Provider,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  switch (provider) {
    case "slack": {
      const body = new URLSearchParams({
        client_id: env.slackClientId(),
        client_secret: env.slackClientSecret(),
        code,
        redirect_uri: redirectUri,
      });
      const r = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json: unknown = await r.json();
      if (!isRecord(json) || json.ok !== true) {
        throw new Error(`slack token exchange failed: ${pickString(json, "error") ?? r.status}`);
      }
      const accessToken =
        pickString(json, "authed_user", "access_token") ?? pickString(json, "access_token");
      if (!accessToken) throw new Error("slack: no access_token in response");
      const scopeStr =
        pickString(json, "authed_user", "scope") ?? pickString(json, "scope") ?? "";
      return {
        accessToken,
        refreshToken: pickString(json, "authed_user", "refresh_token"),
        scopes: scopeStr ? scopeStr.split(",").filter(Boolean) : [],
        externalAccountId:
          pickString(json, "authed_user", "id") ?? pickString(json, "team", "id"),
        expiresAt: null,
      };
    }

    case "github": {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: env.githubClientId(),
          client_secret: env.githubClientSecret(),
          code,
          redirect_uri: redirectUri,
        }),
      });
      const json: unknown = await r.json();
      if (!isRecord(json)) throw new Error("github: malformed token response");
      const accessToken = pickString(json, "access_token");
      if (!accessToken) {
        throw new Error(`github token exchange failed: ${pickString(json, "error") ?? r.status}`);
      }
      const scopeStr = pickString(json, "scope") ?? "";

      let externalAccountId: string | null = null;
      try {
        const ur = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "chief-of-staff-agent",
          },
        });
        const uj: unknown = await ur.json();
        if (isRecord(uj)) {
          const id = uj.id;
          externalAccountId =
            typeof id === "number" ? String(id) : str(id) ?? pickString(uj, "login");
        }
      } catch {
        // non-fatal — id lookup is best-effort
      }

      return {
        accessToken,
        refreshToken: null,
        scopes: scopeStr ? scopeStr.split(/[, ]+/).filter(Boolean) : [],
        externalAccountId,
        expiresAt: null,
      };
    }

    case "notion": {
      const basic = Buffer.from(
        `${env.notionClientId()}:${env.notionClientSecret()}`,
      ).toString("base64");
      const r = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      const json: unknown = await r.json();
      if (!isRecord(json)) throw new Error("notion: malformed token response");
      const accessToken = pickString(json, "access_token");
      if (!accessToken) {
        throw new Error(
          `notion token exchange failed: ${pickString(json, "error") ?? r.status}`,
        );
      }
      return {
        accessToken,
        refreshToken: pickString(json, "refresh_token"),
        scopes: [],
        externalAccountId:
          pickString(json, "bot_id") ?? pickString(json, "workspace_id"),
        expiresAt: null,
      };
    }

    case "linear": {
      const r = await fetch("https://api.linear.app/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: env.linearClientId(),
          client_secret: env.linearClientSecret(),
        }),
      });
      const json: unknown = await r.json();
      if (!isRecord(json)) throw new Error("linear: malformed token response");
      const accessToken = pickString(json, "access_token");
      if (!accessToken) {
        throw new Error(
          `linear token exchange failed: ${pickString(json, "error") ?? r.status}`,
        );
      }
      const expiresIn = num(json.expires_in);
      const scope = json.scope;
      const scopes = Array.isArray(scope)
        ? scope.filter((s): s is string => typeof s === "string")
        : typeof scope === "string"
          ? scope.split(/[, ]+/).filter(Boolean)
          : [];
      return {
        accessToken,
        refreshToken: pickString(json, "refresh_token"),
        scopes,
        externalAccountId: null,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      };
    }
  }
}

/* --------------------------------- GET --------------------------------- */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (!isM6Provider(provider)) {
    return redirect(`/connections?error=${encodeURIComponent(provider)}`);
  }

  const u = await requireUser("connections/callback");
  if (isResponse(u)) return u;
  const { userId } = u;

  try {
    const url = new URL(request.url);
    const qpError = url.searchParams.get("error");
    if (qpError) throw new Error(`provider returned error: ${qpError}`);

    const code = url.searchParams.get("code");
    const queryState = url.searchParams.get("state");
    if (!code) throw new Error("missing code");
    if (!queryState) throw new Error("missing state");

    const jar = await cookies();
    const cookieState = verifyState(jar.get(OAUTH_STATE_COOKIE)?.value, provider);
    if (!cookieState || cookieState !== queryState) {
      throw new Error("state mismatch");
    }

    const redirectUri = `${env.appBaseUrl()}/api/connections/${provider}/callback`;
    const result = await exchange(provider, code, redirectUri);

    await prisma.connection.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        accessTokenEncrypted: encryptTokenOrNull(result.accessToken),
        refreshTokenEncrypted: encryptTokenOrNull(result.refreshToken),
        scopes: result.scopes,
        status: "connected",
        externalAccountId: result.externalAccountId,
        expiresAt: result.expiresAt,
      },
      update: {
        accessTokenEncrypted: encryptTokenOrNull(result.accessToken),
        refreshTokenEncrypted: encryptTokenOrNull(result.refreshToken),
        scopes: result.scopes,
        status: "connected",
        externalAccountId: result.externalAccountId,
        expiresAt: result.expiresAt,
      },
    });

    await logAction({
      userId,
      action: "connection.connect",
      result: { provider, externalAccountId: result.externalAccountId },
    });

    return redirect(`/connections?connected=${encodeURIComponent(provider)}`);
  } catch (e) {
    console.error(`[oauth callback:${provider}]`, e);
    return redirect(`/connections?error=${encodeURIComponent(provider)}`);
  }
}

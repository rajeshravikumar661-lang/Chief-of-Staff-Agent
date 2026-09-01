import { err, isResponse, ok, requireUser } from "@/lib/http";
import { env } from "@/lib/env";
import { GOOGLE_PROVIDERS, OAUTH_M6_PROVIDERS, isKnownProvider } from "@/app/api/_shared";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  makeStateValue,
  signState,
} from "@/lib/oauthState";

export const dynamic = "force-dynamic";

type M6Provider = (typeof OAUTH_M6_PROVIDERS)[number];

function isM6Provider(p: string): p is M6Provider {
  return (OAUTH_M6_PROVIDERS as readonly string[]).includes(p);
}

/** Client id/secret for an M6 provider, or `null` when not configured. */
function m6Credentials(provider: M6Provider): { id: string; secret: string } | null {
  const map: Record<M6Provider, { id: string; secret: string }> = {
    slack: { id: env.slackClientId(), secret: env.slackClientSecret() },
    github: { id: env.githubClientId(), secret: env.githubClientSecret() },
    notion: { id: env.notionClientId(), secret: env.notionClientSecret() },
    linear: { id: env.linearClientId(), secret: env.linearClientSecret() },
  };
  const c = map[provider];
  return c.id && c.secret ? c : null;
}

function authorizeUrl(
  provider: M6Provider,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  switch (provider) {
    case "slack": {
      const u = new URL("https://slack.com/oauth/v2/authorize");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set(
        "user_scope",
        "search:read,channels:history,channels:read,chat:write,users:read",
      );
      return u.toString();
    }
    case "github": {
      const u = new URL("https://github.com/login/oauth/authorize");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", "repo,read:org,notifications");
      return u.toString();
    }
    case "notion": {
      const u = new URL("https://api.notion.com/v1/oauth/authorize");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("owner", "user");
      u.searchParams.set("response_type", "code");
      return u.toString();
    }
    case "linear": {
      const u = new URL("https://linear.app/oauth/authorize");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", "read,write");
      u.searchParams.set("response_type", "code");
      return u.toString();
    }
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const u = await requireUser("connections/connect");
  if (isResponse(u)) return u;

  const { provider } = await params;

  if ((GOOGLE_PROVIDERS as readonly string[]).includes(provider)) {
    // One Google consent covers gmail + calendar + drive.
    return ok({ redirectUrl: "/api/auth/signin/google" });
  }

  if (isM6Provider(provider)) {
    const creds = m6Credentials(provider);
    if (!creds) {
      return err(
        "NOT_CONFIGURED",
        `${provider} OAuth is not configured on this server`,
        501,
      );
    }

    const redirectUri = `${env.appBaseUrl()}/api/connections/${provider}/callback`;
    const stateValue = makeStateValue(provider);
    const url = authorizeUrl(provider, creds.id, redirectUri, stateValue);

    const res = ok({ redirectUrl: url });
    res.cookies.set(OAUTH_STATE_COOKIE, signState(stateValue), {
      httpOnly: true,
      secure: env.appBaseUrl().startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });
    return res;
  }

  if (!isKnownProvider(provider)) {
    return err("BAD_REQUEST", `Unknown provider: ${provider}`, 400);
  }

  return err("BAD_REQUEST", `Cannot connect provider: ${provider}`, 400);
}

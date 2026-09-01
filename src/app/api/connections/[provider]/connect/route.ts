import { err, isResponse, ok, requireUser } from "@/lib/http";
import { GOOGLE_PROVIDERS, isKnownProvider } from "@/app/api/_shared";

export const dynamic = "force-dynamic";

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

  if (provider === "slack" || provider === "github" || provider === "notion") {
    return err("NOT_IMPLEMENTED", `${provider} connector lands in milestone 6`, 501);
  }

  if (!isKnownProvider(provider)) {
    return err("BAD_REQUEST", `Unknown provider: ${provider}`, 400);
  }

  return err("BAD_REQUEST", `Cannot connect provider: ${provider}`, 400);
}

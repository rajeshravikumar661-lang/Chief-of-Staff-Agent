import { auth } from "@/auth";
import { err, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return err("UNAUTHENTICATED", "Sign in required", 401);
  const { id, name, email, image } = session.user;
  return ok({ id, name: name ?? null, email: email ?? null, image: image ?? null });
}

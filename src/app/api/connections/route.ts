import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { ALL_PROVIDERS } from "@/app/api/_shared";
import type { ConnectionDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser("connections");
  if (isResponse(u)) return u;
  const { userId } = u;

  const db = scopedDb(userId);
  const rows = await db.connection.findMany();
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const connections: ConnectionDTO[] = ALL_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (!row) {
      return {
        provider,
        status: "disconnected",
        scopes: [],
        connectedAt: null,
        lastSyncAt: null,
      };
    }
    return {
      provider,
      status: row.status,
      scopes: row.scopes,
      connectedAt: row.createdAt ? row.createdAt.toISOString() : null,
      lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    };
  });

  return ok(connections);
}

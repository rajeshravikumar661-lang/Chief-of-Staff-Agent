/** Google Workspace connector (M6): Sheets / Docs / Slides read tools.
 *  Stub — replaced by the connector implementation. Uses the existing Google
 *  OAuth from src/integrations/google/auth.ts (scopes added in src/auth.ts). */
import type { Tool } from "@/agent/tools/types";
export const gworkspaceTools: Tool[] = [];
export async function syncGworkspace(_userId: string): Promise<number> {
  return 0;
}

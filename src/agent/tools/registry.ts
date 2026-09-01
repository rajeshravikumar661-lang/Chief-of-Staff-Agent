/**
 * Tool registry (spec §6, §21).
 *
 * The single place that assembles every connector's `Tool[]` into one catalogue
 * the planner and Action Manager share. Lookups are Map-backed and built once at
 * module load; a duplicate tool name is a hard error so two connectors can never
 * silently shadow each other.
 */

import type { ToolCatalogEntry } from "@/agent/types";
import type { Tool } from "@/agent/tools/types";

import { gmailTools } from "@/integrations/gmail";
import { calendarTools } from "@/integrations/calendar";
import { driveTools } from "@/integrations/drive";
import { slackTools } from "@/integrations/slack";
import { githubTools } from "@/integrations/github";
import { notionTools } from "@/integrations/notion";
import { linearTools } from "@/integrations/linear";
import { gworkspaceTools } from "@/integrations/gworkspace";

const ALL_TOOLS: Tool[] = [
  ...gmailTools,
  ...calendarTools,
  ...driveTools,
  ...slackTools,
  ...githubTools,
  ...notionTools,
  ...linearTools,
  ...gworkspaceTools,
];

const TOOLS_BY_NAME: Map<string, Tool> = (() => {
  const map = new Map<string, Tool>();
  for (const tool of ALL_TOOLS) {
    if (map.has(tool.name)) {
      throw new Error(
        `Duplicate tool name in registry: "${tool.name}". Two connectors registered the same tool.`,
      );
    }
    map.set(tool.name, tool);
  }
  return map;
})();

/** Every registered tool, in registration order. */
export function getAllTools(): Tool[] {
  return [...ALL_TOOLS];
}

/** Look up a single tool by its fully-qualified name (e.g. "gmail.send"). */
export function getTool(name: string): Tool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** Compact `{ name, description, permission }` list for the planner prompt. */
export function toolCatalog(): ToolCatalogEntry[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
  }));
}

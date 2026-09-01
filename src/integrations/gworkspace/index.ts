/** Google Workspace connector (M6): Sheets / Docs / Slides read tools.
 *  Rides the existing Google OAuth connection (token read via provider "drive";
 *  scopes declared in src/auth.ts). On-demand lookups only — no background sync. */
export { gworkspaceTools } from "./tools";
export { syncGworkspace } from "./sync";
export {
  extractGoogleId,
  getSpreadsheet,
  readRange,
  getDoc,
  getPresentation,
} from "./client";
export type {
  SheetInfo,
  SpreadsheetMeta,
  RangeValues,
  DocContent,
  SlideText,
  PresentationContent,
} from "./client";

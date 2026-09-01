/**
 * Gmail integration (spec §6, §7): connector tools, the sync job, and the thin
 * client wrappers.
 */
export { gmailTools } from "./tools";
export { syncGmail } from "./sync";
export {
  searchMessages,
  getThread,
  getMessage,
  getRawMessage,
  listRecent,
  createDraft,
  sendMessage,
  modifyLabels,
  archiveMessage,
} from "./client";
export type {
  NormalizedMessage,
  NormalizedThread,
  RawGmailMessage,
  DraftRef,
  OutgoingEmail,
  LabelChange,
} from "./client";

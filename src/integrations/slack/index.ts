/**
 * Slack integration (spec §6, §7): connector tools, the sync job, and the thin
 * client wrappers.
 */
export { slackTools } from "./tools";
export { syncSlack } from "./sync";
export {
  withSlack,
  listConversations,
  searchMessages,
  getChannelHistory,
  postMessage,
  whoAmI,
  SlackNotConnectedError,
} from "./client";
export type {
  NormalizedSlackMessage,
  SlackChannel,
  SlackIdentity,
} from "./client";

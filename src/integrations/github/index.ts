/**
 * GitHub integration (spec §6, §7): connector tools, the Task sync job, the
 * morning-briefing review feed, and the thin client wrappers.
 */
export { githubTools } from "./tools";
export { syncGithub } from "./sync";
export { githubReviewItems } from "./reviewItems";
export type { GithubReviewItem } from "./reviewItems";
export {
  getOctokit,
  ConnectionMissingError,
  whoAmI,
  listReviewRequests,
  listMyOpenPRs,
  listAssignedIssues,
  getPR,
  getIssue,
  commentOnIssue,
  listIssueComments,
  listNotifications,
} from "./client";
export type {
  GithubItem,
  GithubUser,
  GithubComment,
  GithubNotification,
} from "./client";

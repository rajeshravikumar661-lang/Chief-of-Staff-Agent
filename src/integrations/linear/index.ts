/**
 * Linear integration (spec §6, §7): connector tools, the sync job, and the thin
 * dependency-free GraphQL client wrappers.
 */
export { linearTools } from "./tools";
export { syncLinear } from "./sync";
export {
  gql,
  viewer,
  myAssignedIssues,
  myCreatedIssues,
  searchIssues,
  getIssue,
  createIssue,
  commentOnIssue,
  listTeams,
  LinearConnectionError,
} from "./client";
export type {
  LinearViewer,
  LinearIssue,
  LinearIssueDetail,
  LinearComment,
  LinearTeam,
  CreateIssueInput,
  CreatedIssue,
  CreatedComment,
} from "./client";

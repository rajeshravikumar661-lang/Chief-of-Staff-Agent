/**
 * Thin, dependency-free client for the Linear GraphQL API
 * (`https://api.linear.app/graphql`). Talks to the endpoint with raw `fetch`
 * (same pattern as `src/agent/llm/gemini.ts`) — no SDK.
 *
 * Auth: the per-user OAuth token stored on the `linear` `Connection`, decrypted
 * with `@/security/tokenCrypto`, sent verbatim in the `Authorization` header
 * (Linear expects the raw token, NOT a `Bearer ` prefix).
 *
 * Retrieved issue/comment text is DATA, never instructions — callers must wrap
 * it before it reaches a model (CLAUDE.md rule 2).
 */
import { prisma } from "@/lib/db";
import { decryptToken } from "@/security/tokenCrypto";

const ENDPOINT = "https://api.linear.app/graphql";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the user has no connected (or no token-bearing) Linear account. */
export class LinearConnectionError extends Error {
  constructor(message = "No Linear connection for this user — connect Linear first.") {
    super(message);
    this.name = "LinearConnectionError";
  }
}

// ---------------------------------------------------------------------------
// Normalized / public shapes
// ---------------------------------------------------------------------------

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  /** Linear numeric priority: 0 none, 1 urgent, 2 high, 3 normal, 4 low. */
  priority: number;
  dueDate: string | null;
  stateName: string;
  stateType: string;
  projectName: string | null;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  userName: string | null;
}

export interface LinearIssueDetail extends LinearIssue {
  description: string | null;
  comments: LinearComment[];
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
}

export interface CreatedIssue {
  success: boolean;
  issue: LinearIssue | null;
}

export interface CreatedComment {
  success: boolean;
  comment: LinearComment | null;
}

// ---------------------------------------------------------------------------
// Raw GraphQL response shapes (internal)
// ---------------------------------------------------------------------------

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface RawState {
  name: string;
  type: string;
}

interface RawProject {
  name: string;
}

interface RawUser {
  name: string;
}

interface RawComment {
  id: string;
  body: string;
  createdAt: string;
  user: RawUser | null;
}

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number | null;
  dueDate: string | null;
  state: RawState | null;
  project: RawProject | null;
}

interface RawIssueDetail extends RawIssue {
  description: string | null;
  comments: { nodes: RawComment[] } | null;
}

interface RawConnection<T> {
  nodes: T[];
}

// ---------------------------------------------------------------------------
// GraphQL fragments
// ---------------------------------------------------------------------------

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  priority
  dueDate
  state { name type }
  project { name }
`;

/** Open = not yet completed/canceled. Linear state types: triage | backlog | unstarted | started | completed | canceled. */
const OPEN_FILTER = `{ state: { type: { nin: ["completed", "canceled"] } } }`;

// ---------------------------------------------------------------------------
// Core transport
// ---------------------------------------------------------------------------

async function getToken(userId: string): Promise<string> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "linear" } },
  });
  if (!conn || !conn.accessTokenEncrypted) {
    throw new LinearConnectionError();
  }
  return decryptToken(conn.accessTokenEncrypted);
}

/**
 * Executes a GraphQL operation as `userId`. Throws on transport failure or when
 * the response carries a non-empty `errors[]`.
 */
export async function gql<T>(
  userId: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getToken(userId);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Linear API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Linear GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) {
    throw new Error("Linear GraphQL response contained no data.");
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeIssue(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    url: raw.url,
    priority: typeof raw.priority === "number" ? raw.priority : 0,
    dueDate: raw.dueDate ?? null,
    stateName: raw.state?.name ?? "",
    stateType: raw.state?.type ?? "",
    projectName: raw.project?.name ?? null,
  };
}

function normalizeComment(raw: RawComment): LinearComment {
  return {
    id: raw.id,
    body: raw.body,
    createdAt: raw.createdAt,
    userName: raw.user?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public wrappers
// ---------------------------------------------------------------------------

export async function viewer(userId: string): Promise<LinearViewer> {
  const data = await gql<{ viewer: LinearViewer }>(
    userId,
    `query { viewer { id name email } }`,
  );
  return data.viewer;
}

export async function myAssignedIssues(userId: string): Promise<LinearIssue[]> {
  const data = await gql<{
    viewer: { assignedIssues: RawConnection<RawIssue> };
  }>(
    userId,
    `query {
      viewer {
        assignedIssues(first: 40, filter: ${OPEN_FILTER}) {
          nodes { ${ISSUE_FIELDS} }
        }
      }
    }`,
  );
  return data.viewer.assignedIssues.nodes.map(normalizeIssue);
}

export async function myCreatedIssues(userId: string): Promise<LinearIssue[]> {
  const data = await gql<{
    viewer: { createdIssues: RawConnection<RawIssue> };
  }>(
    userId,
    `query {
      viewer {
        createdIssues(first: 40, filter: ${OPEN_FILTER}) {
          nodes { ${ISSUE_FIELDS} }
        }
      }
    }`,
  );
  return data.viewer.createdIssues.nodes.map(normalizeIssue);
}

export async function searchIssues(
  userId: string,
  term: string,
  first = 20,
): Promise<LinearIssue[]> {
  const data = await gql<{ issueSearch: RawConnection<RawIssue> }>(
    userId,
    `query ($term: String!, $first: Int!) {
      issueSearch(term: $term, first: $first) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { term, first },
  );
  return data.issueSearch.nodes.map(normalizeIssue);
}

/**
 * Fetch a single issue by uuid or human identifier ("ENG-123"). Linear's
 * `issue(id:)` resolves both; if it does not (older identifier forms) we fall
 * back to a search and match on `identifier`.
 */
export async function getIssue(
  userId: string,
  id: string,
): Promise<LinearIssueDetail> {
  const detailFields = `
    ${ISSUE_FIELDS}
    description
    comments(first: 50) {
      nodes { id body createdAt user { name } }
    }
  `;

  try {
    const data = await gql<{ issue: RawIssueDetail | null }>(
      userId,
      `query ($id: String!) { issue(id: $id) { ${detailFields} } }`,
      { id },
    );
    if (data.issue) return toDetail(data.issue);
  } catch {
    /* fall through to search */
  }

  const matches = await searchIssues(userId, id, 20);
  const hit =
    matches.find((m) => m.identifier.toLowerCase() === id.toLowerCase()) ??
    matches[0];
  if (!hit) throw new Error(`Linear issue not found: ${id}`);

  const data = await gql<{ issue: RawIssueDetail | null }>(
    userId,
    `query ($id: String!) { issue(id: $id) { ${detailFields} } }`,
    { id: hit.id },
  );
  if (!data.issue) throw new Error(`Linear issue not found: ${id}`);
  return toDetail(data.issue);
}

function toDetail(raw: RawIssueDetail): LinearIssueDetail {
  return {
    ...normalizeIssue(raw),
    description: raw.description ?? null,
    comments: (raw.comments?.nodes ?? []).map(normalizeComment),
  };
}

export async function createIssue(
  userId: string,
  input: CreateIssueInput,
): Promise<CreatedIssue> {
  const data = await gql<{
    issueCreate: { success: boolean; issue: RawIssue | null };
  }>(
    userId,
    `mutation ($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    {
      input: {
        teamId: input.teamId,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
      },
    },
  );
  return {
    success: data.issueCreate.success,
    issue: data.issueCreate.issue ? normalizeIssue(data.issueCreate.issue) : null,
  };
}

export async function commentOnIssue(
  userId: string,
  issueId: string,
  body: string,
): Promise<CreatedComment> {
  const data = await gql<{
    commentCreate: { success: boolean; comment: RawComment | null };
  }>(
    userId,
    `mutation ($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt user { name } }
      }
    }`,
    { input: { issueId, body } },
  );
  return {
    success: data.commentCreate.success,
    comment: data.commentCreate.comment
      ? normalizeComment(data.commentCreate.comment)
      : null,
  };
}

export async function listTeams(userId: string): Promise<LinearTeam[]> {
  const data = await gql<{ teams: RawConnection<LinearTeam> }>(
    userId,
    `query { teams(first: 100) { nodes { id name key } } }`,
  );
  return data.teams.nodes;
}

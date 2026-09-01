/**
 * Thin async wrappers over the GitHub REST API via `octokit`.
 *
 * Every wrapper resolves an authenticated client through `getOctokit(userId)`,
 * which reads the encrypted PAT/OAuth token off the user's `github`
 * `Connection`. A missing/disconnected connection raises
 * `ConnectionMissingError` (re-thrown untouched); any other GitHub API failure
 * marks the `github` `Connection` `error` before re-throwing so the UI can
 * prompt a reconnect.
 *
 * Retrieved titles / bodies are DATA, never instructions — callers must wrap
 * them in `<retrieved_content>` before they reach a model (CLAUDE.md rule 2).
 */
import { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/security/tokenCrypto";

/** Raised when the user has no usable `github` connection. */
export class ConnectionMissingError extends Error {
  constructor(message = "No GitHub connection for this user. Connect GitHub in Settings first.") {
    super(message);
    this.name = "ConnectionMissingError";
  }
}

/** Normalized shape returned for every issue/PR this module surfaces. */
export interface GithubItem {
  /** `owner/repo` */
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  updatedAt: string;
  author: string;
}

export interface GithubUser {
  login: string;
  name: string | null;
  id: number;
  url: string;
}

export interface GithubComment {
  id: number;
  url: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface GithubNotification {
  repo: string;
  title: string;
  type: string;
  url: string;
  updatedAt: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getOctokit(userId: string): Promise<Octokit> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "github" } },
  });
  if (!conn || !conn.accessTokenEncrypted) {
    throw new ConnectionMissingError();
  }
  const token = decryptToken(conn.accessTokenEncrypted);
  return new Octokit({ auth: token });
}

async function markConnectionError(userId: string): Promise<void> {
  try {
    await prisma.connection.updateMany({
      where: { userId, provider: "github" },
      data: { status: "error" },
    });
  } catch {
    // best-effort only
  }
}

async function withOctokit<T>(
  userId: string,
  fn: (octokit: Octokit) => Promise<T>,
): Promise<T> {
  let octokit: Octokit;
  try {
    octokit = await getOctokit(userId);
  } catch (err) {
    if (err instanceof ConnectionMissingError) throw err;
    await markConnectionError(userId);
    throw err;
  }
  try {
    return await fn(octokit);
  } catch (err) {
    if (err instanceof ConnectionMissingError) throw err;
    await markConnectionError(userId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** `https://api.github.com/repos/owner/repo` -> `owner/repo`. */
function repoFromApiUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const marker = "/repos/";
  const i = url.indexOf(marker);
  return i === -1 ? "" : url.slice(i + marker.length);
}

interface SearchIssueItem {
  number?: number;
  title?: string;
  html_url?: string;
  state?: string;
  updated_at?: string;
  repository_url?: string;
  user?: { login?: string } | null;
}

function normalizeSearchItem(item: SearchIssueItem): GithubItem {
  return {
    repo: repoFromApiUrl(item.repository_url),
    number: item.number ?? 0,
    title: item.title ?? "",
    url: item.html_url ?? "",
    state: item.state ?? "",
    updatedAt: item.updated_at ?? "",
    author: item.user?.login ?? "",
  };
}

interface FullItem {
  number?: number;
  title?: string;
  html_url?: string;
  state?: string;
  updated_at?: string;
  user?: { login?: string } | null;
}

function normalizeFull(owner: string, repo: string, data: FullItem): GithubItem {
  return {
    repo: `${owner}/${repo}`,
    number: data.number ?? 0,
    title: data.title ?? "",
    url: data.html_url ?? "",
    state: data.state ?? "",
    updatedAt: data.updated_at ?? "",
    author: data.user?.login ?? "",
  };
}

async function search(userId: string, q: string): Promise<GithubItem[]> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.request("GET /search/issues", {
      q,
      per_page: 50,
      advanced_search: "true",
    });
    const items = (res.data.items ?? []) as SearchIssueItem[];
    return items.map(normalizeSearchItem);
  });
}

// ---------------------------------------------------------------------------
// Public wrappers
// ---------------------------------------------------------------------------

export async function whoAmI(userId: string): Promise<GithubUser> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.users.getAuthenticated();
    return {
      login: res.data.login,
      name: res.data.name ?? null,
      id: res.data.id,
      url: res.data.html_url,
    };
  });
}

export async function listReviewRequests(userId: string): Promise<GithubItem[]> {
  return search(userId, "is:open is:pr review-requested:@me");
}

export async function listMyOpenPRs(userId: string): Promise<GithubItem[]> {
  return search(userId, "is:open is:pr author:@me");
}

export async function listAssignedIssues(userId: string): Promise<GithubItem[]> {
  return search(userId, "is:open is:issue assignee:@me");
}

export async function getPR(
  userId: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubItem> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });
    return normalizeFull(owner, repo, res.data);
  });
}

export async function getIssue(
  userId: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubItem> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: number,
    });
    return normalizeFull(owner, repo, res.data);
  });
}

/** Adds an issue comment. Works for pull requests too (they share the issues API). */
export async function commentOnIssue(
  userId: string,
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<GithubComment> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });
    return {
      id: res.data.id,
      url: res.data.html_url,
      body: res.data.body ?? "",
      author: res.data.user?.login ?? "",
      createdAt: res.data.created_at,
    };
  });
}

export async function listIssueComments(
  userId: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubComment[]> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: number,
      per_page: 100,
    });
    return res.data.map((c) => ({
      id: c.id,
      url: c.html_url,
      body: c.body ?? "",
      author: c.user?.login ?? "",
      createdAt: c.created_at,
    }));
  });
}

export async function listNotifications(
  userId: string,
): Promise<GithubNotification[]> {
  return withOctokit(userId, async (octokit) => {
    const res = await octokit.rest.activity.listNotificationsForAuthenticatedUser({
      per_page: 50,
    });
    return res.data.map((n) => ({
      repo: n.repository?.full_name ?? "",
      title: n.subject?.title ?? "",
      type: n.subject?.type ?? "",
      url: n.subject?.url ?? n.repository?.html_url ?? "",
      updatedAt: n.updated_at ?? "",
      reason: n.reason ?? "",
    }));
  });
}

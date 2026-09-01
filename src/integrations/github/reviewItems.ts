/**
 * Morning-briefing feed: pull requests awaiting the user's review.
 *
 * Returns a compact, presentation-ready list. Resolves to `[]` when GitHub is
 * not connected or on any error — the briefing must never fail for one feed.
 */
import { ConnectionMissingError, listReviewRequests } from "./client";

export interface GithubReviewItem {
  title: string;
  detail: string;
  url: string;
  ageHours: number;
}

function ageHours(updatedAt: string): number {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 0;
  const hrs = (Date.now() - t) / 3_600_000;
  return hrs < 0 ? 0 : Math.round(hrs);
}

export async function githubReviewItems(
  userId: string,
): Promise<GithubReviewItem[]> {
  try {
    const prs = await listReviewRequests(userId);
    return prs.map((pr) => ({
      title: pr.title,
      detail: `${pr.repo}#${pr.number}${pr.author ? ` by ${pr.author}` : ""}`,
      url: pr.url,
      ageHours: ageHours(pr.updatedAt),
    }));
  } catch (err) {
    if (!(err instanceof ConnectionMissingError)) {
      console.error(
        `[github/reviewItems] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return [];
  }
}

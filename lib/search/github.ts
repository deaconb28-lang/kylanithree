import { issueBodyToText, repoFromUrl, githubAuthHeaders } from "../ingest/sources/github";
import type { Candidate } from "./types";

// GitHub issue search at query time, for a niche the corpus has not reached yet.
//
// The same endpoint the crawler uses, shaped for one founder's keywords instead of a standing
// phrase. Worth having on the live-shallow path specifically because it needs no credential — the
// other two live sources are Hacker News and Stack Exchange, and adding a third that cannot fail on
// a missing key widens the first screen for free.
//
// `in:body` and `is:issue`, for the reasons in lib/ingest/sources/github.ts: the sentence revealing
// somebody wants a tool is almost never in the title, and a pull request is a proposed change
// rather than a stated need.

const API = "https://api.github.com";

type GhIssue = {
  id?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  created_at?: string;
  comments?: number;
  user?: { login?: string; type?: string };
  repository_url?: string;
  pull_request?: unknown;
  reactions?: { total_count?: number };
};

export async function searchGithub(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<Candidate[]> {
  const { query, windowDays, limit = 20, timeoutMs = 4000 } = opts;
  const term = query.trim();
  if (!term) return [];

  // Bounded by date rather than sorted by relevance alone: a five-year-old issue describing a
  // problem is not someone to write to today, and the window the planner computed is the honest
  // bound to apply.
  const since = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString().slice(0, 10);
  const q = `"${term.replace(/"/g, "")}" in:body is:issue created:>${since}`;

  const qs = new URLSearchParams({
    q,
    sort: "created",
    order: "desc",
    per_page: String(Math.min(Math.max(limit, 1), 100)),
  });

  const res = await fetch(`${API}/search/issues?${qs}`, {
    // Shared with the crawler, so a malformed GITHUB_TOKEN is ignored here too rather than turning
    // a request that works unauthenticated into a 401.
    headers: githubAuthHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status}`);

  const json = (await res.json()) as { items?: GhIssue[] };
  const out: Candidate[] = [];
  for (const issue of json.items ?? []) {
    const login = issue.user?.login;
    if (!issue.id || !login || !issue.html_url || issue.pull_request) continue;
    if (issue.user?.type === "Bot" || login.endsWith("[bot]")) continue;
    const body = issueBodyToText(issue.body);
    if (!body) continue;
    const repo = repoFromUrl(issue.repository_url);

    out.push({
      id: `github:${issue.id}`,
      venueId: "github:issues",
      venueName: repo ? `${repo} · GitHub` : "GitHub",
      // "Forum" is the closest member of the display union — GitHub issues are threaded discussions
      // with an opening post and replies, which is the shape that label means.
      platform: "Forum",
      // The identity key. `platform` cannot serve: "Forum" also means Stack Exchange, Discourse and
      // Lemmy, and fingerprinting on it would merge four networks' handles into one person.
      networkId: "github",
      author: login,
      permalink: issue.html_url,
      postedAt: new Date(issue.created_at ?? Date.now()),
      title: issue.title ?? "",
      body: body.slice(0, 4000),
      score: issue.reactions?.total_count ?? 0,
      numComments: issue.comments ?? 0,
    });
  }
  return out;
}

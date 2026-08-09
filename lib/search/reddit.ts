import type { Candidate } from "./types";

// Reddit's public OAuth REST API (oauth.reddit.com), called server-side from our own routes.
//
// Deliberately NOT Devvit (developers.reddit.com, `context.reddit` / RedditAPIClient): that client
// only exists inside apps deployed to Reddit's own infrastructure and auto-authenticates there.
// Kylani runs on Vercel and searches Reddit on a founder's behalf, so it needs its own registered
// app + client-credentials token, which is what this module manages.
//
// Credentials are optional at runtime: without them we fall back to the unauthenticated
// www.reddit.com/*.json endpoints, which work but are rate-limited hard enough to be unreliable
// under real traffic. `redditAuthMode()` reports which path is live so a thin run can be explained
// rather than guessed at.

const OAUTH_BASE = "https://oauth.reddit.com";
const PUBLIC_BASE = "https://www.reddit.com";

const USER_AGENT = process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0";

type TokenCache = { token: string; expiresAt: number };
// Module scope: survives across requests on a warm serverless instance, so a 24h token is fetched
// roughly once per instance rather than once per search.
let tokenCache: TokenCache | null = null;

export function hasRedditCredentials() {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

export function redditAuthMode(): "oauth" | "public" {
  return hasRedditCredentials() ? "oauth" : "public";
}

/**
 * The client-credentials token, shared with the ingest crawler.
 *
 * Exported so `lib/ingest/sources/reddit.ts` reuses this cache rather than minting its own. One
 * token per instance is the point — Reddit meters per client id, and two modules independently
 * requesting tokens against the same app is a way to spend the quota on authentication.
 */
export async function redditAccessToken(): Promise<string | null> {
  return getAccessToken();
}

async function getAccessToken(): Promise<string | null> {
  if (!hasRedditCredentials()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Reddit token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Reddit token response had no access_token");
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

// One place that knows about both auth modes, so callers just name a path and params. `.json` is
// appended only on the public host — oauth.reddit.com always returns JSON and rejects the suffix.
async function redditGet<T>(path: string, params: Record<string, string | number>, timeoutMs: number): Promise<T> {
  const token = await getAccessToken();
  const qs = new URLSearchParams({ raw_json: "1", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const url = token ? `${OAUTH_BASE}${path}?${qs}` : `${PUBLIC_BASE}${path}.json?${qs}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 429) throw new Error("Reddit rate limit hit (429)");
  if (!res.ok) throw new Error(`Reddit request failed: ${res.status}`);
  return (await res.json()) as T;
}

type RedditListing<T> = { data?: { children?: { data?: T }[] } };

type RawSubreddit = {
  display_name?: string;
  display_name_prefixed?: string;
  subscribers?: number;
  public_description?: string;
  title?: string;
  over18?: boolean;
  subreddit_type?: string;
};

type RawPost = {
  id?: string;
  author?: string;
  permalink?: string;
  created_utc?: number;
  title?: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  subreddit?: string;
  stickied?: boolean;
  over_18?: boolean;
  is_self?: boolean;
  url?: string;
  distinguished?: string | null;
};

export type SubredditResult = {
  name: string; // "r/investing"
  slug: string; // "investing"
  subscribers: number | null;
  description: string;
  nsfw: boolean;
};

// Real subreddit discovery with REAL subscriber counts — this is what lets venue ranking prefer a
// focused 8k community over a 2M general one, instead of trusting a model's guess at size.
export async function searchSubreddits(query: string, timeoutMs = 4000): Promise<SubredditResult[]> {
  const json = await redditGet<RedditListing<RawSubreddit>>("/subreddits/search", { q: query, limit: 25 }, timeoutMs);
  const children = json.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((d): d is RawSubreddit => Boolean(d?.display_name))
    .filter((d) => d.subreddit_type === "public" || d.subreddit_type === undefined)
    .map((d) => ({
      name: d.display_name_prefixed || `r/${d.display_name}`,
      slug: d.display_name as string,
      subscribers: typeof d.subscribers === "number" ? d.subscribers : null,
      description: (d.public_description || d.title || "").slice(0, 300),
      nsfw: Boolean(d.over18),
    }));
}

// Reddit's `t` window is bucketed, so map the niche's real relevance window onto the smallest
// bucket that still covers it — a 45-day window must search `year`, not `month`, or we'd silently
// discard the back half of it before the stale filter ever sees those posts.
export function windowToRedditT(days: number): "day" | "week" | "month" | "year" | "all" {
  if (days <= 1) return "day";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (days <= 366) return "year";
  return "all";
}

export async function searchPostsInSubreddit(opts: {
  slug: string;
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
  // Accepted for signature parity across sources. Reddit paginates by opaque cursor rather than
  // page number, so deeper waves widen by phrase here instead of by page.
  page?: number;
}): Promise<Candidate[]> {
  const { slug, query, windowDays, limit = 25, timeoutMs = 4000 } = opts;
  const json = await redditGet<RedditListing<RawPost>>(
    `/r/${encodeURIComponent(slug)}/search`,
    { q: query, restrict_sr: 1, sort: "new", t: windowToRedditT(windowDays), limit },
    timeoutMs,
  );
  const children = json.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((d): d is RawPost => Boolean(d?.id && d.author && d.permalink))
    .filter((d) => !d.stickied && !d.over_18 && !d.distinguished)
    .map((d) => ({
      id: `reddit:${d.id}`,
      venueId: `reddit:${slug}`,
      venueName: `r/${slug}`,
      platform: "Reddit" as const,
      networkId: "reddit",
      author: d.author as string,
      permalink: `https://www.reddit.com${d.permalink}`,
      postedAt: new Date((d.created_utc ?? 0) * 1000),
      title: d.title ?? "",
      // A link post has no selftext; its title still carries the complaint, so title is the
      // fallback body rather than dropping the post for emptiness it can't help.
      body: (d.selftext && d.selftext.trim() ? d.selftext : d.title ?? "").slice(0, 4000),
      score: d.score ?? 0,
      numComments: d.num_comments ?? 0,
    }));
}

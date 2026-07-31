import type { Candidate } from "./types";

// X (Twitter) via the official API v2 recent-search endpoint.
//
// IMPORTANT, and the reason this is gated rather than always-on: X has no free search API. Reading
// tweets programmatically requires a paid tier (Basic and up) and an `X_BEARER_TOKEN`. There is no
// honest way to search X without one — unauthenticated scraping violates their terms and is
// blocked in practice, and the public Nitter mirrors are effectively dead. So this source stays
// dark until a token is present, and says so, rather than silently contributing nothing.
//
// Note also that recent-search only covers roughly the last 7 days on the lower tiers; a niche
// with a longer relevance window will still only get a week of X coverage.

export function hasXCredentials() {
  return Boolean(process.env.X_BEARER_TOKEN);
}

type XTweet = {
  id?: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number };
};

type XUser = { id?: string; username?: string };

export async function searchX(opts: {
  query: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<Candidate[]> {
  const { query, limit = 25, timeoutMs = 4000 } = opts;
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];

  const qs = new URLSearchParams({
    // Exclude retweets and replies: a retweet is not that person's own words, and the excerpt has
    // to be something they actually said.
    query: `${query} -is:retweet -is:reply lang:en`,
    max_results: String(Math.min(Math.max(limit, 10), 100)),
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username",
  });

  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`X search failed: ${res.status}`);

  const json = (await res.json()) as { data?: XTweet[]; includes?: { users?: XUser[] } };
  const usersById = new Map((json.includes?.users ?? []).map((u) => [u.id, u.username]));

  return (json.data ?? [])
    .filter((t): t is XTweet => Boolean(t?.id && t.text && t.created_at))
    .map((t) => {
      const username = usersById.get(t.author_id ?? "") ?? "unknown";
      return {
        id: `x:${t.id}`,
        venueId: "x:all",
        venueName: "X",
        platform: "X" as const,
        author: `@${username}`,
        permalink: `https://x.com/${username}/status/${t.id}`,
        postedAt: new Date(t.created_at as string),
        title: "",
        body: (t.text ?? "").slice(0, 4000),
        score: t.public_metrics?.like_count ?? 0,
        numComments: t.public_metrics?.reply_count ?? 0,
      };
    });
}

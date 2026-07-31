import type { Candidate } from "./types";

// Bluesky via the public AT Protocol AppView. No key, no registration, no approval, no account —
// the search endpoint is genuinely open, which makes this the closest legitimate substitute for
// the short-form public complaints that Reddit and X would otherwise supply.
//
// Deliberately chosen over scraping a platform that has denied access: this is the same class of
// signal, obtained through a door the platform actually leaves open.

const PUBLIC_APPVIEW = "https://public.api.bsky.app";

type BskyPost = {
  uri?: string;
  author?: { handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  replyCount?: number;
  likeCount?: number;
  repostCount?: number;
};

export async function searchBluesky(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<Candidate[]> {
  const { query, windowDays, limit = 25, timeoutMs = 4000 } = opts;

  const qs = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    sort: "latest",
    // The API accepts an ISO date floor, so the relevance window is enforced at the source rather
    // than by fetching everything and discarding most of it.
    since: new Date(Date.now() - windowDays * 86_400_000).toISOString(),
  });

  const res = await fetch(`${PUBLIC_APPVIEW}/xrpc/app.bsky.feed.searchPosts?${qs}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Bluesky search failed: ${res.status}`);

  const json = (await res.json()) as { posts?: BskyPost[] };

  return (json.posts ?? [])
    .filter((p): p is BskyPost => Boolean(p?.uri && p.author?.handle && p.record?.text))
    .map((p) => {
      // at://did:plc:xxx/app.bsky.feed.post/RKEY — the record key is the last segment, and is what
      // the web permalink is built from.
      const rkey = (p.uri as string).split("/").pop() ?? "";
      const handle = p.author?.handle as string;
      return {
        id: `bsky:${rkey}`,
        venueId: "bsky:all",
        venueName: "Bluesky",
        platform: "X" as const,
        author: `@${handle}`,
        permalink: `https://bsky.app/profile/${handle}/post/${rkey}`,
        postedAt: new Date(p.record?.createdAt ?? Date.now()),
        title: "",
        body: (p.record?.text ?? "").slice(0, 4000),
        score: p.likeCount ?? 0,
        numComments: p.replyCount ?? 0,
      };
    });
}

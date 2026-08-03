import type { Candidate } from "./types";

// Bluesky via the AT Protocol. This is the closest legitimate substitute for the short-form
// public complaints that Reddit and X would otherwise supply — the same class of signal, obtained
// through a door the platform actually leaves open rather than by scraping one that is shut.
//
// It does need a session: searchPosts answers 403 unauthenticated from a datacenter IP, which was
// confirmed against production rather than assumed. A Bluesky account and an app password are free
// and take a minute, so the cost is setup friction, not money or approval.

const PDS = "https://bsky.social";

// searchPosts returns 403 unauthenticated from a datacenter IP — confirmed against production, not
// assumed. A session fixes it, and a Bluesky account plus an app password are free and take a
// minute to create, so this stays a legitimate source rather than something to work around.
// Without credentials the source reports itself unavailable instead of silently contributing zero.
type TokenCache = { jwt: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function hasBlueskyCredentials() {
  return Boolean(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD);
}

/**
 * The session token, shared with the ingest crawler.
 *
 * Exported so `lib/ingest/sources/bluesky.ts` reuses this cache rather than keeping its own. Two
 * modules calling `createSession` against one app password is how an account gets rate-limited on
 * login — and the crawler runs every few minutes forever, so it would be the one to trip it.
 */
export async function blueskySessionJwt(): Promise<string | null> {
  return getSessionJwt();
}

async function getSessionJwt(): Promise<string | null> {
  if (!hasBlueskyCredentials()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.jwt;

  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: process.env.BLUESKY_IDENTIFIER,
      password: process.env.BLUESKY_APP_PASSWORD,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bluesky session failed: ${res.status}`);
  const json = (await res.json()) as { accessJwt?: string };
  if (!json.accessJwt) throw new Error("Bluesky session response had no accessJwt");
  // Access tokens are short-lived; refresh well inside their window rather than tracking exp.
  tokenCache = { jwt: json.accessJwt, expiresAt: Date.now() + 60 * 60 * 1000 };
  return tokenCache.jwt;
}

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
  // Accepted for parity. Bluesky paginates by cursor, so deeper waves widen by phrase and by a
  // larger page size rather than by page number.
  page?: number;
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

  const jwt = await getSessionJwt();
  if (!jwt) return [];

  const res = await fetch(`${PDS}/xrpc/app.bsky.feed.searchPosts?${qs}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${jwt}` },
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
        // Displayed as "X" because that union has no Bluesky member and short-form is the closest
        // shape — but it is NOT X, and fingerprinting it as one would merge two networks' handles.
        networkId: "bluesky",
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

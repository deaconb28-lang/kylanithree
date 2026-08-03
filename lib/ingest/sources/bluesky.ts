import { blueskySessionJwt, hasBlueskyCredentials } from "../../search/bluesky";
import type { RawDocument } from "../normalize";

// Bluesky, crawled continuously rather than only searched at query time.
//
// It was already a query-time source. Adding it to the corpus is a different thing: query time can
// only ask about the niche in front of it, and only inside a search's budget, so it sees a keyhole
// view of a firehose. A standing crawl accumulates.
//
// THE CRAWL UNIT IS A STANDING QUERY, NOT A COMMUNITY.
//
// Every other source in this registry has places — Stack Exchange sites, Discourse hosts, Lemmy
// instances. Bluesky has none: it is one flat network with no topical rooms, so there is nothing to
// enumerate. What there is instead is *language*. The phrases below are the same need markers
// `lexicalGate` uses to decide whether a document is worth classifying, which means the crawl is
// pre-filtered by the thing that would otherwise throw most of it away — a rare case where the
// cheapest query is also the right one.
//
// Phrases, not words. `"looking for a tool"` unquoted matches every post containing "tool", which
// on a general-purpose social network is most of them. Quoted, it matches the sentence a buyer
// actually writes. Each phrase is its own registry row, so a phrase that produces nothing sinks in
// the scheduler's yield ordering on its own rather than needing to be pruned by hand.
//
// Auth is required and this is not optional: `searchPosts` answers 403 unauthenticated from a
// datacenter IP. Without credentials the crawler says so and stores nothing, rather than reporting
// a healthy zero forever.

const PDS = "https://bsky.social";

/**
 * The standing queries. Drawn from `NEED_MARKERS` in `lib/search/intent.ts` — deliberately the same
 * vocabulary the gate applies, so the crawl and the filter are not looking for different things.
 *
 * Kept to phrases that read as a person with a problem rather than a person with an opinion. The
 * test to apply before adding one: could this sentence appear in a post that has nothing to do with
 * wanting a tool? "frustrated" alone passes that test badly; "so frustrating to" barely better;
 * `"is there a tool"` not at all. Same discipline as the Stack Exchange keyword routing, which has
 * produced this exact class of bug twice.
 */
export const BLUESKY_STANDING_QUERIES: string[] = [
  '"looking for a tool"',
  '"looking for an app"',
  '"is there a tool"',
  '"is there an app"',
  '"anyone know a tool"',
  '"anyone recommend"',
  '"any recommendations for"',
  '"any alternative to"',
  '"alternative to"',
  '"switching away from"',
  '"migrating off"',
  '"we built our own"',
  '"built my own"',
  '"sick of paying"',
  '"tired of manually"',
  '"doing this manually"',
  '"spreadsheet to track"',
  '"wish there was"',
  '"why is there no"',
  '"cancelled our subscription"',
];

type BskyPost = {
  uri?: string;
  cid?: string;
  author?: { handle?: string; displayName?: string; did?: string };
  record?: { text?: string; createdAt?: string };
  replyCount?: number;
  likeCount?: number;
  repostCount?: number;
};

export type BlueskyPage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * One page of one standing query.
 *
 * `sort=latest` with the API's own cursor, so a poll resumes where the last one stopped instead of
 * re-reading the top of the feed. When the cursor runs out the page reports `exhausted` and the
 * worker clears it, which restarts the query from now — the standing-query equivalent of tracking
 * a live feed.
 */
export async function crawlBluesky(opts: {
  query: string;
  cursor?: string | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<BlueskyPage> {
  const { query, cursor, limit = 50, timeoutMs = 12_000 } = opts;

  if (!hasBlueskyCredentials()) {
    // Loud, not silent. A source that quietly stores nothing looks identical to a niche nobody is
    // talking about, and this one has a fix a human can apply in a minute.
    throw new Error(
      "BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD are not set — searchPosts answers 403 to " +
        "unauthenticated datacenter traffic, so this source cannot crawl without them.",
    );
  }
  const jwt = await blueskySessionJwt();
  if (!jwt) throw new Error("Bluesky session could not be created");

  const qs = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    sort: "latest",
  });
  if (cursor) qs.set("cursor", cursor);

  const res = await fetch(`${PDS}/xrpc/app.bsky.feed.searchPosts?${qs}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Bluesky searchPosts failed: ${res.status}`);

  const json = (await res.json()) as { posts?: BskyPost[]; cursor?: string };
  const posts = json.posts ?? [];
  if (posts.length === 0) return { documents: [], nextCursor: null, exhausted: true };

  const documents: RawDocument[] = [];
  for (const p of posts) {
    const handle = p.author?.handle;
    const text = p.record?.text;
    if (!p.uri || !handle || !text?.trim()) continue;

    // at://did:plc:xxx/app.bsky.feed.post/RKEY — the record key is the last segment and is what the
    // web permalink is built from.
    const rkey = p.uri.split("/").pop() ?? "";
    if (!rkey) continue;

    documents.push({
      platform: "bluesky",
      // The DID, not the handle, when we have it: a handle is a rented domain that people change,
      // and keying on it would make one person's rename look like a new person with a new backlog
      // of posts. The rkey alone is not unique across authors.
      externalId: `${p.author?.did ?? handle}:${rkey}`,
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      // Handles are globally unique on Bluesky — one flat network, no instances — so unlike Lemmy
      // and Discourse there is nothing to qualify them with.
      authorRef: handle,
      authorScope: "all",
      authorId: p.author?.did,
      body: text,
      postedAt: new Date(p.record?.createdAt ?? Date.now()),
      engagement: { score: p.likeCount ?? 0, comments: p.replyCount ?? 0 },
    });
  }

  // `posts` non-empty with no cursor means this was the last page.
  return { documents, nextCursor: json.cursor ?? null, exhausted: !json.cursor };
}

import { PermanentSourceError } from "../errors";
import type { RawDocument } from "../normalize";

// Reddit, through the public `.json` endpoints — no key, no OAuth, no approval.
//
// WHY THIS PATH AND NOT THE API. Reddit's Responsible Builder Policy closed self-service OAuth:
// getting a client id now means submitting an individual approval request, and the commercial tier
// is metered per thousand requests. What survives is the oldest thing Reddit has: append `.json` to
// any public URL and get the same listing the browser renders. It needs nothing, and it is the
// documented behaviour of a public page rather than a scrape of one.
//
// WHAT THAT COSTS, STATED PLAINLY. Unauthenticated access is rate-limited far harder than a token
// would be, and Reddit is known to block datacenter egress ranges outright. So this source is
// deliberately the most timid in the registry — one request per poll, one poll at a time, a long
// interval — and if Reddit refuses the worker's IP it will say so in `scrape_log` rather than
// quietly returning nothing. That is an empirical question about Railway's egress that only running
// it can answer.
//
// IDENTITY IS SIMPLE HERE, FOR ONCE. Reddit usernames are globally unique across one flat site, so
// `authorRef` is the bare username and `authorScope` is "all" — no host to qualify with, unlike
// Discourse and Lemmy. The trap is different: `[deleted]` is not a person.

// Reddit's own format: <platform>:<app id>:<version>. A generic or absent User-Agent is one of the
// documented ways to get 429'd immediately, so this is not decoration.
const UA = process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0 (by /u/kylani-app)";

type RawPost = {
  id?: string;
  name?: string;
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
  distinguished?: string | null;
  removed_by_category?: string | null;
};

type Listing = { data?: { after?: string | null; children?: { data?: RawPost }[] } };

export type RedditPage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * One page of a subreddit's newest posts.
 *
 * `/new` rather than `/hot` or `/top`: this is a crawler tracking a live feed, and the other two
 * re-serve the same popular posts for days, which costs the same request and stores nothing new.
 *
 * The cursor is Reddit's opaque `after` fullname (e.g. `t3_1abcdef`), not a page number — pagination
 * is by position in the listing, so a poll genuinely resumes rather than re-reading the top.
 */
export async function crawlReddit(opts: {
  subreddit: string;
  cursor?: string | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<RedditPage> {
  const { subreddit, cursor, limit = 100, timeoutMs = 12_000 } = opts;

  const qs = new URLSearchParams({
    // raw_json=1 stops Reddit HTML-escaping &, < and > in every body, which would otherwise reach
    // the classifier as literal &amp; and be embedded that way.
    raw_json: "1",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });
  if (cursor) qs.set("after", cursor);

  const res = await fetch(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?${qs}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });

  // A subreddit that does not exist will never exist on retry, so it retires immediately rather
  // than burning three polls proving it after every worker restart.
  if (res.status === 404) throw new PermanentSourceError(`Reddit r/${subreddit} does not exist (404)`);
  // 403 is deliberately NOT permanent, and the distinction matters more here than anywhere else in
  // the registry. It means either "this subreddit is private or quarantined" or "Reddit is refusing
  // this IP" — and retiring on the second reading would silently delete the entire Reddit registry
  // the first time the worker's egress range got blocked. Backoff is the safe response to an
  // ambiguous refusal.
  if (!res.ok) throw new Error(`Reddit r/${subreddit} failed: ${res.status}`);

  const json = (await res.json()) as Listing;
  const children = json.data?.children ?? [];
  if (children.length === 0) return { documents: [], nextCursor: null, exhausted: true };

  const documents: RawDocument[] = [];
  for (const child of children) {
    const post = child.data;
    if (!post?.id || !post.author || !post.permalink) continue;
    // "[deleted]" is what Reddit returns for a removed account. It is not a person, and
    // fingerprinting it would merge every deleted author on the site into one prolific human.
    if (post.author === "[deleted]" || post.author === "[removed]" || post.author === "AutoModerator") continue;
    // Stickied threads are moderator furniture; distinguished posts are moderators speaking as
    // moderators. Neither is someone with a problem.
    if (post.stickied || post.over_18 || post.distinguished) continue;
    if (post.removed_by_category) continue;

    // A link post has no selftext and its title still carries the complaint, so the title is the
    // fallback body rather than dropping a post for emptiness it cannot help. The length floor in
    // normalise still applies, so a bare headline does not survive on its own.
    const body = post.selftext?.trim() ? post.selftext : (post.title ?? "");
    if (!body.trim()) continue;

    documents.push({
      platform: "reddit",
      externalId: post.id,
      url: `https://www.reddit.com${post.permalink}`,
      authorRef: post.author,
      // Flat site, globally unique usernames — nothing to namespace against.
      authorScope: "all",
      title: post.title,
      body,
      postedAt: new Date((post.created_utc ?? 0) * 1000),
      engagement: { score: post.score ?? 0, comments: post.num_comments ?? 0 },
    });
  }

  // `after` is null on the last page of a listing. Clearing the cursor restarts from the top next
  // poll, which is what keeps the crawler tracking new posts once it has caught up.
  const after = json.data?.after ?? null;
  return { documents, nextCursor: after, exhausted: !after };
}

/** Cheap probe before adding a subreddit to the registry — mirrors isDiscourseForum/isLemmyInstance. */
export async function isPublicSubreddit(subreddit: string, timeoutMs = 6000): Promise<boolean> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/about.json?raw_json=1`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: { subreddit_type?: string } };
    return json.data?.subreddit_type === "public";
  } catch {
    return false;
  }
}

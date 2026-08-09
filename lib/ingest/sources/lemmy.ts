import type { RawDocument } from "../normalize";

// Lemmy — the closest thing to Reddit that is actually open.
//
// Every instance serves `/api/v3/post/list` unauthenticated, with no key, no registration and no
// datacenter-IP block. That matters because Reddit is the source this product most obviously wants
// and least plausibly gets: its terms are enforced by revoking access, its API is paid, and it
// answers 403 to server traffic. Lemmy is the same conversational shape — a person posting a
// problem into a topical community, with replies underneath — through a door that is open.
//
// Verified against 20 instances before this file existed: 17 answered `/api/v3/post/list` with
// `post`, `creator`, `community` and `counts`. Three did not, for three different reasons worth
// knowing — one now serves HTML at that path, one reports `instance_is_private`, and one sits
// behind a Cloudflare interstitial. All three fail loudly at the first poll and get retired by
// `isPermanentSourceError`, so the registry converges without a human editing it.
//
// IDENTITY IS FEDERATED, AND THIS IS THE TRAP.
//
// A post fetched from programming.dev is very often not *from* programming.dev. In the sample used
// to build this file, the top post on programming.dev/c/linux was written by `tofu`, whose
// `actor_id` is `https://lemmy.nocturnal.garden/u/tofu` — a different server entirely. Two
// consequences, both of which produce silently wrong people rather than errors:
//
//   1. Fingerprinting on `polledHost/name` would make one human into one person per instance that
//      federated their post, and would merge two different `tofu`s who happen to share a name on
//      different home servers. The home host in `actor_id` is the only global identity Lemmy has,
//      so `authorRef` is `homeHost/name` and `authorScope` is the home host — never the host we
//      happened to ask. This is the Discourse namespacing bug again, one layer deeper.
//   2. Profile lookups need the qualified form for a remote user (`name@homeHost`) and the bare
//      name for a local one. `/api/v3/user?username=Deep@lemmy.world` asked *of lemmy.world*
//      answers 404; the bare name works. Both forms were confirmed against the live API.
//
// `ap_id` is likewise the canonical permalink — the post's URL on the server it was written on,
// which keeps working after the instance we polled defederates or disappears.

const UA = "kylani-ingest/1.0 (+https://kylani.app)";

type LemmyPost = {
  id?: number;
  name?: string;
  body?: string;
  published?: string;
  ap_id?: string;
  deleted?: boolean;
  removed?: boolean;
  nsfw?: boolean;
};

type LemmyPerson = {
  name?: string;
  actor_id?: string;
  local?: boolean;
  /** The platform says outright whether this is a bot. Cheaper and truer than inferring it. */
  bot_account?: boolean;
  deleted?: boolean;
};

type LemmyPostView = {
  post?: LemmyPost;
  creator?: LemmyPerson;
  community?: { name?: string };
  counts?: { score?: number; comments?: number };
};

export type LemmyPage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * The host an actor actually lives on, from their federated `actor_id`.
 *
 * Falls back to the polled host only when `actor_id` is missing or unparseable, which is the
 * honest default: a local user's `actor_id` points at the instance we are already talking to, so
 * the fallback and the real answer agree in exactly the case where the fallback is used.
 */
export function homeHostOf(person: LemmyPerson | undefined, polledHost: string): string {
  if (!person?.actor_id) return polledHost;
  try {
    return new URL(person.actor_id).host;
  } catch {
    return polledHost;
  }
}

/**
 * The `username` a profile lookup needs, given where the person lives and where we are asking.
 *
 * Exported because `lib/ingest/people.ts` has to reconstruct exactly this, and a second
 * implementation of a rule this fiddly would drift.
 */
export function lemmyUserQuery(handle: string, askedHost: string): string {
  // `handle` is stored as "homeHost/name" — the same qualified shape Discourse uses.
  const slash = handle.indexOf("/");
  if (slash < 0) return handle;
  const homeHost = handle.slice(0, slash);
  const name = handle.slice(slash + 1);
  return homeHost === askedHost ? name : `${name}@${homeHost}`;
}

/**
 * One page of an instance's local feed.
 *
 * `type_=Local` rather than `All` on purpose. `All` returns everything the instance has federated,
 * so polling twenty servers with `All` would fetch the same popular posts twenty times and spend
 * the whole crawl budget re-reading them — the dedupe would catch it, but only after paying for it.
 * `Local` makes each instance contribute the posts it is the source of, so the registry's breadth
 * is real breadth.
 */
export async function crawlLemmy(opts: {
  host: string;
  cursor?: string | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<LemmyPage> {
  const { host, cursor, limit = 40, timeoutMs = 12_000 } = opts;
  // Lemmy pages are 1-indexed; page 0 returns the same rows as page 1 and would double every
  // first poll.
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isFinite(page) || page < 1) return { documents: [], nextCursor: null, exhausted: true };

  const url =
    `https://${host}/api/v3/post/list?type_=Local&sort=New` +
    `&limit=${Math.min(Math.max(limit, 1), 50)}&page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Lemmy ${host} post/list failed: ${res.status}`);

  const json = (await res.json()) as { posts?: LemmyPostView[] };
  const views = json.posts ?? [];
  if (views.length === 0) return { documents: [], nextCursor: null, exhausted: true };

  const documents: RawDocument[] = [];
  for (const v of views) {
    const post = v.post;
    const creator = v.creator;
    if (!post?.id || !creator?.name) continue;
    // A link post with no body is a headline someone else wrote. There is no problem statement in
    // it and nothing to quote back, so it is not a lead — dropping it here is cheaper than letting
    // the length floor do it after normalisation.
    if (!post.body?.trim()) continue;
    if (post.deleted || post.removed || post.nsfw) continue;
    // Bots are not buyers. Lemmy states this on the account rather than leaving it to be guessed
    // from posting patterns, so there is no reason to let one through and filter it later.
    if (creator.bot_account || creator.deleted) continue;

    const homeHost = homeHostOf(creator, host);

    documents.push({
      platform: "lemmy",
      // Namespaced by the post's OWN host, not the one we polled. Federation means the same post is
      // reachable from many instances; keyed on `ap_id`'s host it is stored once however many
      // servers carry it, which is what makes polling twenty instances additive rather than
      // twenty times redundant.
      externalId: `${apHostOf(post, host)}:${post.id}`,
      // The canonical permalink, which outlives the instance we happened to read it from.
      url: post.ap_id ?? `https://${host}/post/${post.id}`,
      authorRef: `${homeHost}/${creator.name}`,
      authorScope: homeHost,
      title: post.name,
      body: post.body,
      postedAt: new Date(post.published ?? Date.now()),
      engagement: { score: v.counts?.score ?? 0, comments: v.counts?.comments ?? 0 },
    });
  }

  return { documents, nextCursor: String(page + 1), exhausted: false };
}

function apHostOf(post: LemmyPost, fallback: string): string {
  if (!post.ap_id) return fallback;
  try {
    return new URL(post.ap_id).host;
  } catch {
    return fallback;
  }
}

/** Cheap probe before adding a host to the registry — the same shape as `isDiscourseForum`. */
export async function isLemmyInstance(host: string, timeoutMs = 6000): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}/api/v3/post/list?type_=Local&sort=New&limit=1&page=1`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { posts?: unknown };
    return Array.isArray(json.posts);
  } catch {
    // Includes the instance that now serves HTML at this path: JSON.parse throws, and "not a Lemmy
    // API any more" is exactly the answer that should produce.
    return false;
  }
}

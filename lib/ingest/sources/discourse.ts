import { htmlToText } from "../../htmlText";
import type { RawDocument } from "../normalize";

// Discourse, and the spec is right that this is the enormous win.
//
// Thousands of niche communities run Discourse and expose `/latest.json` and `/t/{id}.json`
// publicly, with no auth and no registration. High signal, low competition, permissive by design —
// and unlike Reddit there is no single gatekeeper who can revoke access to all of it at once.
//
// The trade is that each forum is its own host, so breadth comes from the source registry rather
// than from one API. That is what makes the registry the actual asset.

type LatestTopic = {
  id?: number;
  title?: string;
  slug?: string;
  created_at?: string;
  posts_count?: number;
  like_count?: number;
  last_poster_username?: string;
};

type TopicDetail = {
  id?: number;
  title?: string;
  created_at?: string;
  post_stream?: {
    posts?: {
      id?: number;
      username?: string;
      created_at?: string;
      cooked?: string;
      post_number?: number;
      reply_count?: number;
      score?: number;
    }[];
  };
};

export type DiscoursePage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
}

/**
 * Walks `/latest.json` page by page, then fetches each topic for its opening post.
 *
 * Only the FIRST post of each topic is taken. On a forum, the opening post is the person with the
 * problem; the replies are people answering them — which are not leads, and would pollute the
 * corpus with helpful strangers.
 */
export async function crawlDiscourse(opts: {
  baseUrl: string;
  cursor?: string | null;
  topicsPerPage?: number;
  timeoutMs?: number;
}): Promise<DiscoursePage> {
  const { baseUrl, cursor, topicsPerPage = 15, timeoutMs = 12_000 } = opts;
  const base = baseUrl.replace(/\/$/, "");
  const host = hostOf(base);
  const page = cursor ? Number(cursor) : 0;
  if (!Number.isFinite(page) || page < 0) return { documents: [], nextCursor: null, exhausted: true };

  const listRes = await fetch(`${base}/latest.json?page=${page}`, {
    headers: { Accept: "application/json", "User-Agent": "kylani-ingest/1.0 (+https://kylani.app)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!listRes.ok) throw new Error(`Discourse ${host} latest failed: ${listRes.status}`);
  const list = (await listRes.json()) as { topic_list?: { topics?: LatestTopic[] } };
  const topics = (list.topic_list?.topics ?? []).filter((t) => t.id).slice(0, topicsPerPage);

  if (topics.length === 0) return { documents: [], nextCursor: null, exhausted: true };

  // Sequential rather than parallel: these are small community servers, often self-hosted, and a
  // burst of concurrent requests is how a crawler gets an IP banned from a forum that was happy to
  // serve it slowly.
  const documents: RawDocument[] = [];
  for (const t of topics) {
    try {
      const res = await fetch(`${base}/t/${t.id}.json`, {
        headers: { Accept: "application/json", "User-Agent": "kylani-ingest/1.0 (+https://kylani.app)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const detail = (await res.json()) as TopicDetail;
      const first = detail.post_stream?.posts?.find((p) => p.post_number === 1) ?? detail.post_stream?.posts?.[0];
      if (!first?.username || !first.cooked) continue;
      const body = htmlToText(first.cooked);
      if (!body) continue;

      documents.push({
        platform: "discourse",
        // Namespaced by host — two forums can both have topic 42.
        externalId: `${host}:${t.id}`,
        url: `${base}/t/${t.slug ?? "topic"}/${t.id}`,
        // Qualified by host, exactly like externalId above and for the same reason. Discourse
        // usernames are unique within a forum and meaningless across them, so the bare username
        // collapsed "john" on every forum we crawl into a single person — one identity wearing
        // several strangers' posts, and one profile lookup that could only ever be right once.
        authorRef: `${host}/${first.username}`,
        authorScope: host,
        title: detail.title ?? t.title,
        body,
        postedAt: new Date(first.created_at ?? t.created_at ?? Date.now()),
        engagement: { score: t.like_count ?? 0, comments: Math.max(0, (t.posts_count ?? 1) - 1) },
      });
    } catch {
      // One unreachable topic must not fail the page.
    }
  }

  return { documents, nextCursor: String(page + 1), exhausted: false };
}

/** Cheap probe used before adding a discovered domain to the registry. */
export async function isDiscourseForum(baseUrl: string, timeoutMs = 6000): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/latest.json?page=0`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { topic_list?: unknown };
    return Boolean(json.topic_list);
  } catch {
    return false;
  }
}

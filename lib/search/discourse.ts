import { collapseWhitespace, decodeHtmlEntities, stripTags } from "../htmlText";
import type { Candidate } from "./types";

// Discourse powers a very large share of independent niche forums, and every instance exposes
// /search.json publicly — no key, no registration. That is what makes open-web discovery useful
// rather than decorative: a forum found via web search becomes a real, structured lead source
// carrying author, timestamp, permalink, and body, which is exactly the evidence a lead requires.
//
// Sites that merely LOOK like forums but expose no API are still surfaced as venues, just marked
// unsearchable — better an honest "worth joining" than a fabricated lead.

type DiscoursePost = {
  id?: number;
  username?: string;
  created_at?: string;
  blurb?: string;
  topic_id?: number;
  post_number?: number;
  like_count?: number;
};

type DiscourseTopic = { id?: number; title?: string; slug?: string; posts_count?: number };

function originOf(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

// One call doubles as detection and search: a real Discourse instance answers /search.json with a
// `posts` array, anything else does not. Cheaper than a separate probe.
export async function searchDiscourse(opts: {
  baseUrl: string;
  query: string;
  limit?: number;
  timeoutMs?: number;
  page?: number;
}): Promise<Candidate[]> {
  const { baseUrl, query, limit = 20, timeoutMs = 4000, page = 1 } = opts;
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const res = await fetch(`${origin}/search.json?q=${encodeURIComponent(query)}&page=${Math.max(1, page)}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Discourse ${origin} failed: ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) throw new Error(`Discourse ${origin} did not return JSON`);

  const json = (await res.json()) as { posts?: DiscoursePost[]; topics?: DiscourseTopic[] };
  if (!Array.isArray(json.posts)) throw new Error(`${origin} is not a Discourse instance`);

  const topicsById = new Map((json.topics ?? []).map((t) => [t.id, t]));
  const host = origin.replace(/^https?:\/\//, "");

  return json.posts
    .filter((p): p is DiscoursePost => Boolean(p?.username && p.created_at && p.topic_id))
    .slice(0, limit)
    .map((p) => {
      const topic = topicsById.get(p.topic_id);
      const slug = topic?.slug ?? "topic";
      const permalink = `${origin}/t/${slug}/${p.topic_id}${p.post_number ? `/${p.post_number}` : ""}`;
      // `blurb` is Discourse's own search excerpt and arrives with highlight markup and entities.
      const body = collapseWhitespace(decodeHtmlEntities(stripTags(p.blurb ?? "")));
      const title = collapseWhitespace(decodeHtmlEntities(topic?.title ?? ""));
      return {
        id: `discourse:${host}:${p.id ?? p.topic_id}`,
        venueId: `discourse:${host}`,
        venueName: host,
        platform: "Forum" as const,
        author: p.username as string,
        permalink,
        postedAt: new Date(p.created_at as string),
        title,
        body: (body || title).slice(0, 4000),
        score: p.like_count ?? 0,
        numComments: topic?.posts_count ?? 0,
      };
    });
}

// Confirms an instance is really Discourse before it is offered as a searchable venue, so the
// venue list never promises a source the extractor cannot actually read.
export async function isDiscourse(baseUrl: string, timeoutMs = 3500): Promise<boolean> {
  try {
    const found = await searchDiscourse({ baseUrl, query: "help", limit: 1, timeoutMs });
    return Array.isArray(found);
  } catch {
    return false;
  }
}

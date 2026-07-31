import type { Candidate } from "./types";

// Hacker News via the public Algolia search API.
//
// Deliberately a second, independent source: Reddit requires a registered OAuth app and its
// approval flow can stall or be refused outright, and unauthenticated Reddit reads are frequently
// blocked from datacenter IPs. This endpoint needs no key, no registration, and no approval, so
// the pipeline still produces real leads when Reddit is unavailable — the venue list degrades
// rather than the whole run failing.
//
// HN is one flat community, so there is no discovery step: it is a single always-available venue
// whose relevance is decided by the annotation pass and, ultimately, by the scoring stage.

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1/search_by_date";

type AlgoliaHit = {
  objectID?: string;
  author?: string;
  created_at_i?: number;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  points?: number | null;
  num_comments?: number | null;
};

// Algolia returns comment bodies as HTML fragments. Strip to plain text so the scoring stage's
// verbatim-excerpt check compares against what a human would actually read on the page.
function toPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export async function searchHackerNews(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<Candidate[]> {
  const { query, windowDays, limit = 25, timeoutMs = 4000 } = opts;
  const since = Math.floor((Date.now() - windowDays * 86_400_000) / 1000);

  const qs = new URLSearchParams({
    query,
    // Stories and comments both count: on HN the problem statement is very often a comment
    // buried in a thread, not a submitted story.
    tags: "(story,comment)",
    numericFilters: `created_at_i>${since}`,
    hitsPerPage: String(limit),
  });

  const res = await fetch(`${ALGOLIA_BASE}?${qs}`, {
    headers: { "User-Agent": process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Hacker News search failed: ${res.status}`);
  const json = (await res.json()) as { hits?: AlgoliaHit[] };

  return (json.hits ?? [])
    .filter((h): h is AlgoliaHit => Boolean(h?.objectID && h.author))
    .map((h) => {
      const rawBody = h.comment_text || h.story_text || "";
      const body = rawBody ? toPlainText(rawBody) : "";
      const title = h.title || h.story_title || "";
      return {
        id: `hn:${h.objectID}`,
        venueId: "hn:all",
        venueName: "Hacker News",
        platform: "Hacker News" as const,
        author: h.author as string,
        permalink: `https://news.ycombinator.com/item?id=${h.objectID}`,
        postedAt: new Date((h.created_at_i ?? 0) * 1000),
        title,
        // A comment has no title of its own, so its text carries the whole signal.
        body: (body || title).slice(0, 4000),
        score: h.points ?? 0,
        numComments: h.num_comments ?? 0,
      };
    })
    .filter((c) => c.body.length > 0);
}

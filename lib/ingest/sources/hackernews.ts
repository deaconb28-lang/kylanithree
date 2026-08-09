import { collapseWhitespace, decodeHtmlEntities, stripTags } from "../../htmlText";
import type { RawDocument } from "../normalize";

// Hacker News via the Algolia API. The spec's recommended starting point, and it earns it: full
// backfill available, no auth, no registration, no approval, generous limits, and permissive terms.
//
// This is the INGEST crawler, distinct from lib/search/hackernews.ts which is the query-time
// searcher. The difference is the point of the whole architecture: this one walks the firehose in
// time order and never runs inside a request; that one answers a specific query.

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1/search_by_date";

type AlgoliaHit = {
  objectID?: string;
  author?: string;
  created_at_i?: number;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  story_id?: number | null;
  points?: number | null;
  num_comments?: number | null;
};

function toPlainText(html: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripTags(html)));
}

export type CrawlPage = {
  documents: RawDocument[];
  /** Unix seconds of the oldest item seen. The next poll starts strictly before this. */
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * Walks HN backwards in time from `cursor`. Cursor-based rather than page-based because Algolia's
 * page window is capped and shifts as new items arrive — paging would silently skip and repeat
 * items on a busy feed, which is exactly the failure that makes a crawler quietly lossy.
 */
export async function crawlHackerNews(opts: {
  /** Unix seconds. Fetch items strictly older than this. Omit to start from now. */
  cursor?: string | null;
  /** Don't walk back past this many days on a single pass. */
  maxAgeDays?: number;
  hitsPerPage?: number;
  timeoutMs?: number;
}): Promise<CrawlPage> {
  const { cursor, maxAgeDays = 365, hitsPerPage = 100, timeoutMs = 15_000 } = opts;

  const floor = Math.floor((Date.now() - maxAgeDays * 86_400_000) / 1000);
  const ceiling = cursor ? Number(cursor) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ceiling) || ceiling <= floor) {
    return { documents: [], nextCursor: null, exhausted: true };
  }

  const qs = new URLSearchParams({
    // Stories and comments both count: on HN the problem statement is very often a comment buried
    // in a thread rather than a submitted story.
    tags: "(story,comment)",
    numericFilters: `created_at_i<${ceiling},created_at_i>${floor}`,
    hitsPerPage: String(Math.min(hitsPerPage, 1000)),
  });

  const res = await fetch(`${ALGOLIA_BASE}?${qs}`, {
    headers: { "User-Agent": "kylani-ingest/1.0 (+https://kylani.app)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HN crawl failed: ${res.status}`);
  const json = (await res.json()) as { hits?: AlgoliaHit[] };
  const hits = json.hits ?? [];

  const documents: RawDocument[] = [];
  let oldest = ceiling;

  for (const h of hits) {
    if (!h.objectID || !h.author || !h.created_at_i) continue;
    if (h.created_at_i < oldest) oldest = h.created_at_i;
    const rawBody = h.comment_text || h.story_text || "";
    const body = rawBody ? toPlainText(rawBody) : "";
    const title = h.title || h.story_title || "";
    if (!body && !title) continue;
    documents.push({
      platform: "hn",
      externalId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      authorRef: h.author,
      // HN is one flat site, so the bare username is already globally unique — nothing to qualify.
      authorScope: "all",
      title: title || undefined,
      body: body || title,
      postedAt: new Date(h.created_at_i * 1000),
      parentExternalId: h.story_id ? String(h.story_id) : undefined,
      engagement: { score: h.points ?? 0, comments: h.num_comments ?? 0 },
    });
  }

  // Step strictly past the oldest item, or a page whose items share a timestamp would loop forever.
  const exhausted = hits.length === 0 || oldest <= floor;
  return {
    documents,
    nextCursor: exhausted ? null : String(oldest - 1),
    exhausted,
  };
}

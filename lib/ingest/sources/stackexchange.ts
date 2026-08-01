import { htmlToText } from "../../htmlText";
import type { RawDocument } from "../normalize";

// Stack Exchange. Free API, permissive terms, and the network spans ~180 topical sites — so this is
// emphatically not just a developer source: Cooking, Gardening, Personal Finance, Parenting,
// Photography and Pets are all real Q&A communities.
//
// The structural property that makes it valuable: every item is a QUESTION. Someone asking a
// question in public is, by the format's nature, explicitly looking for help — which is about as
// close to "actively seeking a solution" as a public post gets. Compare that to a social feed,
// where most posts are statements and intent has to be inferred.

const API = "https://api.stackexchange.com/2.3/questions";

type SEQuestion = {
  question_id?: number;
  title?: string;
  body?: string;
  owner?: { display_name?: string; user_id?: number };
  creation_date?: number;
  score?: number;
  answer_count?: number;
  link?: string;
};

export type SEPage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * Walks a site's questions newest-first, paging with a cursor.
 *
 * `filter=withbody` is required — without it the response carries titles only, which leaves nothing
 * to classify and nothing to quote back to the person.
 */
export async function crawlStackExchange(opts: {
  site: string;
  cursor?: string | null;
  pageSize?: number;
  maxAgeDays?: number;
  timeoutMs?: number;
}): Promise<SEPage> {
  const { site, cursor, pageSize = 50, maxAgeDays = 365, timeoutMs = 12_000 } = opts;
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isFinite(page) || page < 1) return { documents: [], nextCursor: null, exhausted: true };

  const fromDate = Math.floor((Date.now() - maxAgeDays * 86_400_000) / 1000);
  const qs = new URLSearchParams({
    site,
    order: "desc",
    sort: "creation",
    filter: "withbody",
    pagesize: String(Math.min(pageSize, 100)),
    page: String(page),
    fromdate: String(fromDate),
  });
  // A free key raises the quota substantially and costs nothing but a form.
  if (process.env.STACKEXCHANGE_KEY) qs.set("key", process.env.STACKEXCHANGE_KEY);

  const res = await fetch(`${API}?${qs}`, {
    headers: { Accept: "application/json", "User-Agent": "kylani-ingest/1.0 (+https://kylani.app)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Stack Exchange ${site} failed: ${res.status}`);
  const json = (await res.json()) as { items?: SEQuestion[]; has_more?: boolean; quota_remaining?: number };

  const documents: RawDocument[] = [];
  for (const q of json.items ?? []) {
    if (!q.question_id || !q.owner?.display_name || !q.creation_date) continue;
    const body = htmlToText(q.body ?? "");
    if (!body) continue;
    documents.push({
      platform: "stackexchange",
      externalId: `${site}:${q.question_id}`,
      url: q.link ?? `https://${site}.stackexchange.com/q/${q.question_id}`,
      authorRef: q.owner.display_name,
      title: q.title,
      body,
      postedAt: new Date(q.creation_date * 1000),
      engagement: { score: q.score ?? 0, comments: q.answer_count ?? 0 },
    });
  }

  // Stop paging when the quota gets low rather than when it runs out — a 502 from an exhausted
  // quota looks identical to the site being down, and confusing the two wastes a debugging hour.
  const quotaLow = typeof json.quota_remaining === "number" && json.quota_remaining < 20;
  const exhausted = !json.has_more || quotaLow;
  return { documents, nextCursor: exhausted ? null : String(page + 1), exhausted };
}

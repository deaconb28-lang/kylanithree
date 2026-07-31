import { htmlToText } from "../htmlText";
import type { Candidate } from "./types";

export { pickStackExchangeSites } from "./seSites";

// Stack Exchange via the official API. No key required (higher quota with a free one), and the
// network spans ~180 topical sites — so this is not just a developer source: Cooking, Gardening,
// Personal Finance, Parenting, Photography and Pets are all real Q&A communities where someone
// describing a problem is, by the format's nature, explicitly asking for help.
//
// That last property matters: every item here is a question, which is about as close to
// "actively looking for a solution" as a public post gets.

const API = "https://api.stackexchange.com/2.3/search/advanced";


type SEItem = {
  question_id?: number;
  title?: string;
  body?: string;
  owner?: { display_name?: string };
  creation_date?: number;
  score?: number;
  answer_count?: number;
  link?: string;
};

export async function searchStackExchange(opts: {
  site: string;
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
  page?: number;
}): Promise<Candidate[]> {
  const { site, query, windowDays, limit = 25, timeoutMs = 4000, page = 1 } = opts;

  const qs = new URLSearchParams({
    order: "desc",
    sort: "creation",
    q: query,
    site,
    // `withbody` is required or the response carries titles only, leaving nothing to quote.
    filter: "withbody",
    pagesize: String(Math.min(limit, 50)),
    page: String(Math.max(1, page)),
    fromdate: String(Math.floor((Date.now() - windowDays * 86_400_000) / 1000)),
  });
  if (process.env.STACKEXCHANGE_KEY) qs.set("key", process.env.STACKEXCHANGE_KEY);

  const res = await fetch(`${API}?${qs}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Stack Exchange ${site} failed: ${res.status}`);

  const json = (await res.json()) as { items?: SEItem[] };

  return (json.items ?? [])
    .filter((i): i is SEItem => Boolean(i?.question_id && i.owner?.display_name && i.creation_date))
    .map((i) => ({
      id: `se:${site}:${i.question_id}`,
      venueId: `stackexchange:${site}`,
      venueName: `${site}.stackexchange.com`,
      platform: "Forum" as const,
      author: i.owner?.display_name as string,
      permalink: i.link ?? `https://${site}.stackexchange.com/q/${i.question_id}`,
      postedAt: new Date((i.creation_date as number) * 1000),
      title: i.title ?? "",
      body: htmlToText(i.body ?? "").slice(0, 4000),
      score: i.score ?? 0,
      numComments: i.answer_count ?? 0,
    }));
}

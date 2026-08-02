import { Corpus, logScrape } from "../ingest/collections";
import { searchHackerNews } from "../search/hackernews";
import { searchStackExchange } from "../search/stackexchange";
import { personFingerprint } from "../credits/fingerprint";
import { lexicalGate, normalizeForIntent, INTENT_WEIGHT, INTENT_TYPES, type IntentType } from "../search/intent";
import { relevantExcerpt } from "../search/excerpt";
import { communitiesForNiche } from "./nicheMap";
import type { DiscoverLead } from "./collections";

// Pass 1. Hard budget 8s, non-negotiable.
//
// Its only job is to put real, named people on screen fast. It is closer to a lookup than a
// search: the niche map says where to look, so none of the budget goes on discovery.
//
// Two routes to a lead, in order:
//   1. The CORPUS — documents the Railway worker already crawled, gated and classified. This is a
//      pure index read, tens of milliseconds, and the leads are already known to be intent-positive.
//   2. LIVE SHALLOW — for a niche the corpus has not covered yet. Only the two sources with the
//      best latency-to-signal, keyword and recency only, no discovery and no enrichment.
//
// Route 2 exists because the corpus is young. Without it, an unseen niche would show nothing on
// the first screen and the whole design would rest on a cache that has not warmed up yet.
//
// The quality floor is identical to pass 2's. If only three people clear it, three people ship.
// Padding a first screen with weak matches is the one failure this design cannot recover from.

export const PASS_ONE_BUDGET_MS = 8_000;
const CORPUS_BUDGET_MS = 2_500;
const LIVE_BUDGET_MS = 4_500;
const PER_SOURCE_TIMEOUT_MS = 3_000;
/** Below this, try the live sources as well rather than shipping a near-empty screen. */
const THIN_THRESHOLD = 5;
const TARGET = 12;

/** The same relevance bar pass 2 applies. Deliberately shared, not a looser copy. */
function clearsFloor(lead: { excerpt: string; intentType?: IntentType }): boolean {
  if (!lead.excerpt || lead.excerpt.trim().length < 40) return false;
  // "none" never ships. An unclassified live-shallow lead has no intent yet — the lexical gate
  // already vouched for it, and pass 2 will classify it properly.
  return lead.intentType !== "none";
}

function scoreOf(intentType: IntentType | undefined, postedAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - postedAt.getTime()) / 86_400_000);
  const recency = Math.exp(-ageDays / 540);
  const intent = intentType ? (INTENT_WEIGHT[intentType] ?? 0.5) : 0.5;
  return intent * 0.7 + recency * 0.3;
}

/** Which route actually produced the corpus half, so a thin screen can be explained afterwards. */
export type CorpusRoute = "search" | "regex" | "none";

type CorpusRow = {
  personFingerprint: string;
  authorRef: string;
  platform: string;
  url: string;
  body: string;
  problemStatement?: string;
  intentType?: IntentType;
  postedAt: Date;
};

/** Shared by both routes so a swap between them cannot change what a lead looks like. */
function toLeadFromCorpus(r: CorpusRow, keywords: string[]): DiscoverLead {
  // The classifier's one-line restatement when it made one, otherwise the span of the real post
  // most about this founder's vocabulary. Both are the person's actual problem rather than the
  // first 240 characters, which on a forum is usually a greeting.
  const source = r.problemStatement || r.body;
  return {
    personFingerprint: r.personFingerprint,
    author: r.authorRef,
    platform: r.platform,
    venueName: r.platform === "hn" ? "Hacker News" : r.platform,
    permalink: r.url,
    excerpt: relevantExcerpt(source, keywords),
    postedAt: r.postedAt,
    intentType: r.intentType,
    matchedFor: keywords.filter((k) => `${r.problemStatement ?? ""} ${r.body}`.toLowerCase().includes(k.toLowerCase())),
    score: scoreOf(r.intentType, r.postedAt),
    foundInPass: 1 as const,
  };
}

/**
 * Is this the cluster telling us `corpus_lexical` does not exist?
 *
 * Worth matching precisely. A missing Atlas Search index is a provisioning state that a redeploy
 * cannot fix and that the regex route can survive; anything else — a timeout, an auth failure, a
 * malformed query — is a real fault that must not be quietly downgraded into "the corpus was thin".
 */
export function isMissingSearchIndex(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /index not found|no such index|search index .* not found|SearchNotEnabled|\$search is not allowed/i.test(message);
}

let warnedNoSearchIndex = false;

/**
 * Route 1: read the corpus. This is the shallow pass, and it is a database read — never the network.
 *
 * `$search` against `corpus_lexical` is the intended path: it ranks by relevance rather than by
 * recency, which is the difference between "the twelve newest documents that happen to contain a
 * keyword" and "the twelve best matches". It must be the FIRST stage of the pipeline and operate on
 * a single collection, which is exactly why `corpus` is flat.
 *
 * The regex fallback stays until the index is actually provisioned. It is not a silent fallback:
 * the route is returned to the caller, persisted on the run, and emitted on the stream, so a thin
 * first screen can always be attributed to the right cause. Delete this branch once the index has
 * been live for a while — it exists only to keep pass 1 working through the provisioning gap.
 */
async function fromCorpus(opts: {
  keywords: string[];
  venueIds: string[];
  limit: number;
}): Promise<{ leads: DiscoverLead[]; route: CorpusRoute }> {
  const { keywords, limit } = opts;
  if (keywords.length === 0) return { leads: [], route: "none" };
  const corpus = await Corpus();

  const terms = keywords.slice(0, 5).map((k) => k.trim()).filter(Boolean);
  if (terms.length === 0) return { leads: [], route: "none" };

  try {
    const rows = await corpus
      .aggregate<CorpusRow>([
        {
          $search: {
            index: "corpus_lexical",
            compound: {
              // One `should` per phrase rather than one joined query: Atlas scores each clause and
              // sums them, so a document matching three of the founder's phrases outranks one that
              // matches a single phrase three times.
              should: terms.map((t) => ({
                text: { query: t, path: ["title", "body", "problemStatement", "namedProducts"] },
              })),
              minimumShouldMatch: 1,
              filter: [{ in: { path: "intentType", value: INTENT_TYPES } }],
            },
          },
        },
        { $limit: limit * 3 },
        {
          $project: {
            personFingerprint: 1,
            authorRef: 1,
            platform: 1,
            url: 1,
            body: 1,
            problemStatement: 1,
            intentType: 1,
            postedAt: 1,
          },
        },
      ])
      .toArray();

    return { leads: rows.map((r) => toLeadFromCorpus(r, keywords)), route: "search" };
  } catch (err) {
    if (!isMissingSearchIndex(err)) throw err;
    if (!warnedNoSearchIndex) {
      warnedNoSearchIndex = true;
      console.error(
        "[passOne] Atlas Search index `corpus_lexical` is missing — falling back to a regex scan, " +
          "which ranks by recency instead of relevance and will find much less. Apply " +
          "docs/atlas-indexes.json to the cluster.",
      );
    }
  }

  // Fallback. Recency-ordered because a regex scan has no relevance score to sort on.
  const pattern = terms.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const rows = await corpus
    .find({
      intentType: { $exists: true, $ne: "none" },
      $or: [{ problemStatement: { $regex: pattern, $options: "i" } }, { body: { $regex: pattern, $options: "i" } }],
    })
    .sort({ postedAt: -1 })
    .limit(limit * 3)
    .toArray();

  return { leads: rows.map((r) => toLeadFromCorpus(r, keywords)), route: "regex" };
}

/** Route 2: the live shallow search, for a niche the corpus has not reached. */
async function fromLiveSources(opts: { keywords: string[]; venueIds: string[]; budgetMs: number }): Promise<DiscoverLead[]> {
  const { keywords, venueIds, budgetMs } = opts;
  const queries = keywords.slice(0, 3);
  if (queries.length === 0) return [];

  const jobs: Promise<DiscoverLead[]>[] = [];
  const common = { windowDays: 365, limit: 15, timeoutMs: PER_SOURCE_TIMEOUT_MS };

  const toLead = (c: {
    author: string;
    platform: string;
    venueName: string;
    permalink: string;
    title: string;
    body: string;
    postedAt: Date;
  }): DiscoverLead | null => {
    const text = `${c.title} ${c.body}`;
    // The same Stage 1 gate the crawler uses. A live-shallow lead has not been classified yet, so
    // this is the only thing standing between the first screen and noise.
    if (!lexicalGate(normalizeForIntent(text)).passed) return null;
    const fp = personFingerprint({ platform: c.platform, authorHandle: c.author });
    if (!fp) return null;
    return {
      personFingerprint: fp,
      author: c.author,
      platform: c.platform,
      venueName: c.venueName,
      permalink: c.permalink,
      excerpt: relevantExcerpt(c.body || c.title, queries),
      postedAt: c.postedAt,
      matchedFor: queries.filter((k) => text.toLowerCase().includes(k.toLowerCase())),
      score: scoreOf(undefined, c.postedAt),
      foundInPass: 1 as const,
    };
  };

  for (const q of queries) {
    if (venueIds.includes("hn:all")) {
      jobs.push(
        searchHackerNews({ ...common, query: q })
          .then((cs) => cs.map(toLead).filter((l): l is DiscoverLead => l !== null))
          .catch(() => []),
      );
    }
    for (const v of venueIds.filter((id) => id.startsWith("stackexchange:"))) {
      jobs.push(
        searchStackExchange({ ...common, query: q, site: v.slice("stackexchange:".length) })
          .then((cs) => cs.map(toLead).filter((l): l is DiscoverLead => l !== null))
          .catch(() => []),
      );
    }
  }

  // Whatever has landed when the budget expires is what ships. A slow source is dropped, never
  // waited on — that is the difference between a thin screen and a broken one.
  const guard = new Promise<DiscoverLead[][]>((resolve) => setTimeout(() => resolve([]), budgetMs));
  const settled = await Promise.race([Promise.all(jobs.map((j) => j.catch(() => []))), guard]);
  return settled.flat();
}

export type PassOneResult = {
  leads: DiscoverLead[];
  usedCorpus: boolean;
  usedLive: boolean;
  /**
   * How the corpus half was served. The whole design says the shallow pass is a database read, so
   * when a run still reaches the network this is the field that says why: `search` means the index
   * answered and the niche is genuinely thin, `regex` means the index is missing, `none` means the
   * read never ran. Without it, "the corpus was cold" and "the corpus was broken" look identical
   * from the outside — which is exactly the confusion this flow has already caused once.
   */
  corpusRoute: CorpusRoute;
  corpusLeads: number;
  /** Set when the corpus read was still running when its budget expired. */
  corpusTimedOut: boolean;
  ms: number;
};

export async function runPassOne(opts: {
  keywords: string[];
  nicheKey: string;
  /** Ties this run's scrape_log rows together. The searchId when there is one. */
  correlationId?: string;
}): Promise<PassOneResult> {
  const t0 = Date.now();
  const { keywords, nicheKey, correlationId = "unknown" } = opts;
  const { venueIds } = await communitiesForNiche(nicheKey);

  let leads: DiscoverLead[] = [];
  let usedCorpus = false;
  let usedLive = false;
  let corpusRoute: CorpusRoute = "none";
  let corpusTimedOut = false;

  const corpusStarted = new Date();
  let corpusError: string | undefined;
  try {
    const timedOut = Symbol("corpus-budget");
    const corpusGuard = new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), CORPUS_BUDGET_MS));
    const raced = await Promise.race([fromCorpus({ keywords, venueIds, limit: TARGET }), corpusGuard]);
    if (raced === timedOut) {
      corpusTimedOut = true;
      console.error(`[passOne] corpus read exceeded its ${CORPUS_BUDGET_MS}ms budget; shipping without it`);
    } else {
      leads = raced.leads;
      corpusRoute = raced.route;
    }
    usedCorpus = leads.length > 0;
  } catch (err) {
    corpusError = err instanceof Error ? err.message : String(err);
    console.error("[passOne] corpus read failed:", corpusError);
  }
  const corpusLeads = leads.length;

  await logScrape({
    correlationId,
    phase: "pass_one_corpus",
    source: `corpus:${corpusRoute}`,
    startedAt: corpusStarted,
    ms: Date.now() - corpusStarted.getTime(),
    itemsFound: corpusLeads,
    budgetHit: corpusTimedOut,
    error: corpusError,
  });

  // The approved fallback: a niche the corpus has not covered still gets a real first screen.
  if (leads.length < THIN_THRESHOLD) {
    const remaining = Math.max(0, PASS_ONE_BUDGET_MS - (Date.now() - t0) - 500);
    if (remaining > 1_000) {
      const liveBudget = Math.min(LIVE_BUDGET_MS, remaining);
      const liveStarted = new Date();
      const live = await fromLiveSources({ keywords, venueIds, budgetMs: liveBudget });
      usedLive = live.length > 0;
      leads = [...leads, ...live];
      const liveMs = Date.now() - liveStarted.getTime();
      await logScrape({
        correlationId,
        phase: "pass_one_live",
        source: venueIds.join(",") || "none",
        startedAt: liveStarted,
        ms: liveMs,
        itemsFound: live.length,
        // The live fetch resolves on its own guard timer, so hitting the budget is how it normally
        // ends rather than an exception — this is the only place that distinction is recorded.
        budgetHit: liveMs >= liveBudget - 50,
      });
    }
  }

  // One person is one lead however many posts surfaced them, and the strongest post wins.
  const byPerson = new Map<string, DiscoverLead>();
  for (const l of leads) {
    if (!clearsFloor(l)) continue;
    const existing = byPerson.get(l.personFingerprint);
    if (!existing || l.score > existing.score) byPerson.set(l.personFingerprint, l);
  }

  return {
    leads: [...byPerson.values()].sort((a, b) => b.score - a.score).slice(0, TARGET),
    usedCorpus,
    usedLive,
    corpusRoute,
    corpusLeads,
    corpusTimedOut,
    ms: Date.now() - t0,
  };
}

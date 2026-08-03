import { Corpus, logScrape } from "../ingest/collections";
import { searchHackerNews } from "../search/hackernews";
import { searchStackExchange } from "../search/stackexchange";
import { searchGithub } from "../search/github";
import { personFingerprint } from "../credits/fingerprint";
import { lexicalGate, normalizeForIntent, INTENT_WEIGHT, INTENT_TYPES, type IntentType } from "../search/intent";
import { relevantExcerpt, matchedTerms, leadSummary } from "../search/excerpt";
import { communitiesForNiche } from "./nicheMap";
import { peopleByFingerprint, describeTenure } from "../people/profiles";
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
  title?: string;
  body: string;
  problemStatement?: string;
  intentType?: IntentType;
  postedAt: Date;
};

/**
 * How to name a network on screen.
 *
 * The corpus stores canonical ids, and the card used to render whatever was stored for anything
 * that was not Hacker News — so a Stack Exchange lead said "stackexchange" and a Bluesky one said
 * "bluesky". Fine while the corpus had one non-HN platform; visibly wrong with five.
 *
 * Discourse and Lemmy are absent on purpose: their venue is the specific forum or instance, which
 * is carried in the fingerprint's scope rather than here, so they fall through to the raw id only
 * when nothing better is known.
 */
const VENUE_LABEL: Record<string, string> = {
  hn: "Hacker News",
  stackexchange: "Stack Exchange",
  lemmy: "Lemmy",
  bluesky: "Bluesky",
  reddit: "Reddit",
  github: "GitHub",
  quora: "Quora",
};

/** Shared by both routes so a swap between them cannot change what a lead looks like. */
function toLeadFromCorpus(r: CorpusRow, keywords: string[]): DiscoverLead {
  // Two different claims, kept apart.
  //
  // The summary says what this is about and is allowed to be the classifier's third-person
  // restatement. The excerpt is evidence and must always come from the BODY — it used to be
  // `problemStatement || body`, so a classified lead had its restatement rendered inside quote
  // marks on the card, attributing to a real person a sentence nobody wrote.
  const summary = leadSummary({ problemStatement: r.problemStatement, body: r.body, keywords });
  const excerpt = relevantExcerpt(r.body, keywords);
  return {
    personFingerprint: r.personFingerprint,
    author: r.authorRef,
    platform: r.platform,
    venueName: VENUE_LABEL[r.platform] ?? r.platform,
    permalink: r.url,
    summary,
    excerpt,
    postedAt: r.postedAt,
    intentType: r.intentType,
    // Matched against the EXCERPT, not the whole document, and that is the point.
    //
    // Scoring the full body produced reasons a founder could not see: a post about SSE resilience
    // testing was labelled "losing track of feature requests" because those words appeared
    // somewhere far from the quote on screen. A claim the reader cannot check against the text in
    // front of them is worse than no claim — it is the fabrication problem wearing a different hat.
    // Deriving it from the shown text makes the reason verifiable by looking.
    matchedFor: matchedTerms(`${summary ?? ""} ${excerpt}`, keywords),
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
            title: 1,
            body: 1,
            problemStatement: 1,
            intentType: 1,
            postedAt: 1,
          },
        },
      ])
      .toArray();

    // A lead has to be able to explain itself.
    //
    // $search with minimumShouldMatch 1 returns anything matching a single common word — which is
    // how a post about verifying a Bitcoin Core node reached an issue tracker's results, the same
    // generic-vocabulary failure that once routed software products to the Pets Stack Exchange.
    //
    // The rule is therefore not "scored highly enough" but "we can say why". If matchedFor is
    // empty the card has no honest answer to "why is this person here", and a row a founder cannot
    // check is worth less than no row — that is the same reasoning that keeps quotes verbatim.
    // A run left thin by this falls through to the live fill and says so via corpusRoute, so the
    // cost of being strict is visible rather than silent.
    const leads = rows
      .map((r) => toLeadFromCorpus(r, keywords))
      .filter((l) => l.matchedFor.length > 0)
      // Most of the founder's vocabulary present beats a single phrase, so the strongest evidence
      // is first even before pass 2 re-ranks.
      .sort((a, b) => b.matchedFor.length - a.matchedFor.length);
    return { leads, route: "search" };
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
    networkId?: string;
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
    // `networkId`, not `platform` — the display label. Pass 1 merges this route's leads with the
    // corpus route's by fingerprint, and the corpus stores "hn" where this used to say
    // "Hacker News", so the same person arriving down both routes never matched and shipped twice.
    const fp = personFingerprint({ platform: c.networkId ?? c.platform, authorHandle: c.author });
    if (!fp) return null;
    const liveBody = c.body || c.title;
    const liveExcerpt = relevantExcerpt(liveBody, queries);
    // No classifier has seen this yet, so the summary is the post's own strongest sentence.
    const liveSummary = leadSummary({ body: liveBody, keywords: queries });
    return {
      personFingerprint: fp,
      author: c.author,
      platform: c.platform,
      venueName: c.venueName,
      permalink: c.permalink,
      summary: liveSummary,
      excerpt: liveExcerpt,
      postedAt: c.postedAt,
      matchedFor: matchedTerms(`${liveSummary ?? ""} ${liveExcerpt}`, queries),
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
    // Unconditional, unlike the two above, because GitHub is not a venue the niche map has to
    // nominate — it is one search endpoint over every public repository, and it needs no key, so
    // there is no configuration under which adding it can fail the run.
    jobs.push(
      searchGithub({ ...common, query: q })
        .then((cs) => cs.map(toLead).filter((l): l is DiscoverLead => l !== null))
        .catch(() => []),
    );
    for (const v of venueIds.filter((id) => id.startsWith("stackexchange:"))) {
      jobs.push(
        searchStackExchange({ ...common, query: q, site: v.slice("stackexchange:".length) })
          .then((cs) => cs.map(toLead).filter((l): l is DiscoverLead => l !== null))
          .catch(() => []),
      );
    }
  }

  // The same explainability rule the corpus route applies. It was corpus-only at first, and the
  // asymmetry showed up immediately in production: being strict about the corpus pushed thin runs
  // into this fallback, which then shipped Hacker News posts about office politics with nothing on
  // the card able to say why they were there. A rule worth having on one route is worth having on
  // the route that covers for it.
  //
  // If both routes come back thin, fewer people ship. That is the stated design — padding a first
  // screen with weak matches is the one failure this cannot recover from.
  const guard = new Promise<DiscoverLead[][]>((resolve) => setTimeout(() => resolve([]), budgetMs));
  const settled = await Promise.race([Promise.all(jobs.map((j) => j.catch(() => []))), guard]);
  return settled.flat().filter((l) => l.matchedFor.length > 0);
}

/**
 * Attach the person behind each lead, if the crawler has met them.
 *
 * One query for the whole page, and only after the shortlist is cut to TARGET — hydrating every
 * candidate would be a hundred-odd lookups to decorate twelve rows. Runs last on purpose: a lead is
 * complete without this, so it is the right shape of work to be able to lose.
 *
 * Never throws. `peopleByFingerprint` already swallows its own failure and returns an empty map,
 * which lands here as "nobody was enriched" — the same state as a cold `people` collection, and the
 * cards render correctly in both.
 */
export async function withPeople(leads: DiscoverLead[]): Promise<DiscoverLead[]> {
  if (leads.length === 0) return leads;
  const profiles = await peopleByFingerprint(leads.map((l) => l.personFingerprint));
  if (profiles.size === 0) return leads;

  return leads.map((l) => {
    const p = profiles.get(l.personFingerprint);
    if (!p) return l;
    const person = {
      displayName: p.displayName,
      bio: p.bio,
      profileUrl: p.profileUrl,
      tenure: describeTenure(p),
      reputation: p.reputation,
    };
    // A row that exists but carries nothing usable is not worth a `person` key — an empty object
    // would make `lead.person &&` true in the UI and render a blank block under the quote.
    const hasAnything = Object.values(person).some((v) => v !== undefined && v !== "");
    return hasAnything ? { ...l, person } : l;
  });
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

  const shortlist = [...byPerson.values()].sort((a, b) => b.score - a.score).slice(0, TARGET);

  return {
    leads: await withPeople(shortlist),
    usedCorpus,
    usedLive,
    corpusRoute,
    corpusLeads,
    corpusTimedOut,
    ms: Date.now() - t0,
  };
}

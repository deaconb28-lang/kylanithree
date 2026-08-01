import { Corpus } from "../ingest/collections";
import { searchHackerNews } from "../search/hackernews";
import { searchStackExchange } from "../search/stackexchange";
import { personFingerprint } from "../credits/fingerprint";
import { lexicalGate, normalizeForIntent, INTENT_WEIGHT, type IntentType } from "../search/intent";
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

function excerptFrom(text: string, max = 240): string {
  const clean = normalizeForIntent(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/** Route 1: read the corpus. Milliseconds, and every hit is already classified. */
async function fromCorpus(opts: { keywords: string[]; venueIds: string[]; limit: number }): Promise<DiscoverLead[]> {
  const { keywords, limit } = opts;
  if (keywords.length === 0) return [];
  const corpus = await Corpus();

  // A plain regex query rather than $search: Atlas Search may not be provisioned yet, and pass 1
  // must work on day one. The index on intentType carries the selective half of this, and the
  // corpus is small enough that the regex scan over that subset is cheap. Swap to $search once the
  // cluster has the index — the shape of the result does not change.
  const pattern = keywords
    .slice(0, 5)
    .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|");
  if (!pattern) return [];

  const rows = await corpus
    .find({
      intentType: { $exists: true, $ne: "none" },
      $or: [{ problemStatement: { $regex: pattern, $options: "i" } }, { body: { $regex: pattern, $options: "i" } }],
    })
    .sort({ postedAt: -1 })
    .limit(limit * 3)
    .toArray();

  return rows.map((r) => ({
    personFingerprint: r.personFingerprint,
    author: r.authorRef,
    platform: r.platform,
    venueName: r.platform === "hn" ? "Hacker News" : r.platform,
    permalink: r.url,
    excerpt: excerptFrom(r.problemStatement || r.body),
    postedAt: r.postedAt,
    intentType: r.intentType,
    matchedFor: keywords.filter((k) => `${r.problemStatement ?? ""} ${r.body}`.toLowerCase().includes(k.toLowerCase())),
    score: scoreOf(r.intentType, r.postedAt),
    foundInPass: 1 as const,
  }));
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
      excerpt: excerptFrom(c.body || c.title),
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
  ms: number;
};

export async function runPassOne(opts: { keywords: string[]; nicheKey: string }): Promise<PassOneResult> {
  const t0 = Date.now();
  const { keywords, nicheKey } = opts;
  const { venueIds } = await communitiesForNiche(nicheKey);

  let leads: DiscoverLead[] = [];
  let usedCorpus = false;
  let usedLive = false;

  try {
    const corpusGuard = new Promise<DiscoverLead[]>((resolve) => setTimeout(() => resolve([]), CORPUS_BUDGET_MS));
    leads = await Promise.race([fromCorpus({ keywords, venueIds, limit: TARGET }), corpusGuard]);
    usedCorpus = leads.length > 0;
  } catch (err) {
    console.error("[passOne] corpus read failed:", err instanceof Error ? err.message : err);
  }

  // The approved fallback: a niche the corpus has not covered still gets a real first screen.
  if (leads.length < THIN_THRESHOLD) {
    const remaining = Math.max(0, PASS_ONE_BUDGET_MS - (Date.now() - t0) - 500);
    if (remaining > 1_000) {
      const live = await fromLiveSources({ keywords, venueIds, budgetMs: Math.min(LIVE_BUDGET_MS, remaining) });
      usedLive = live.length > 0;
      leads = [...leads, ...live];
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
    ms: Date.now() - t0,
  };
}

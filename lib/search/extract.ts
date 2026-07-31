import { searchPostsInSubreddit } from "./reddit";
import { searchHackerNews } from "./hackernews";
import { searchLemmy } from "./lemmy";
import { searchX } from "./x";
import { searchDiscourse } from "./discourse";
import { searchBluesky } from "./bluesky";
import { searchStackExchange } from "./stackexchange";
import { cheapFilter } from "./filter";
import { scoreCandidates } from "./score";
import { settleWithBudget, Trace } from "./trace";
import { buildPhrasePool, planWave } from "./waves";
import type { Candidate, LexiconInput, ScoredLead, Venue } from "./types";

// Stages 2-4 for one shard of venues, at one WAVE of the search.
//
// A wave is how volume is reached without ever relaxing the quality bar. Wave 0 searches the first
// few phrases against page 1; if the caller still needs more leads it asks for wave 1, which moves
// to the next phrases and the next page of results. Widening the net is the only lever pulled —
// the filter and the scoring gate are identical in every wave, so a bigger number can only ever
// come from looking in more places, never from accepting weaker matches.

const PER_SOURCE_TIMEOUT_MS = 4000;
const FANOUT_BUDGET_MS = 7000;
// Cap on what reaches the expensive pass per shard. The cheap filter ranks by signal first, so
// this is a "best N", not a truncation of something unsorted.
const MAX_TO_SCORE = 40;

export async function extractLeads(opts: {
  venues: Venue[];
  lexicon: LexiconInput;
  whatYouSell: string;
  problem: string;
  buyers: { name: string; desc: string }[];
  trace: Trace;
  maxLeads?: number;
  // Which slice of the phrase pool and which page of results this wave should cover.
  wave?: number;
  // Authors already shipped by earlier waves/shards, so a later wave spends its budget on new
  // people instead of re-surfacing and re-scoring the same ones.
  excludeAuthors?: string[];
}): Promise<{ leads: ScoredLead[] }> {
  const { venues, lexicon, whatYouSell, problem, buyers, trace, maxLeads, wave = 0, excludeAuthors = [] } = opts;

  const searchable = venues.filter((v) => v.searchable);

  // Interleave seeking and problem phrases so every wave gets a mix of "shopping right now" and
  // "describing the pain". The previous build sliced this pool down to two entries AFTER
  // concatenating, which meant problemPhrases were never searched at all.
  const phrases = buildPhrasePool(lexicon.seekingPhrases, lexicon.problemPhrases);
  if (phrases.length === 0 || searchable.length === 0) return { leads: [] };
  const { phrases: wavePhrases, page } = planWave(phrases, wave);

  const jobs: (() => Promise<Candidate[]>)[] = [];
  for (const v of searchable) {
    for (const phrase of wavePhrases) {
      const common = { query: phrase, windowDays: lexicon.relevanceWindowDays, limit: 25, timeoutMs: PER_SOURCE_TIMEOUT_MS, page };
      if (v.id.startsWith("reddit:")) {
        jobs.push(() => searchPostsInSubreddit({ ...common, slug: v.id.slice("reddit:".length) }));
      } else if (v.id === "hn:all") {
        jobs.push(() => searchHackerNews(common));
      } else if (v.id === "lemmy:all") {
        jobs.push(() => searchLemmy({ ...common, limit: 20 }));
      } else if (v.id === "bsky:all") {
        jobs.push(() => searchBluesky({ ...common, limit: 50 }));
      } else if (v.id.startsWith("stackexchange:")) {
        jobs.push(() => searchStackExchange({ ...common, site: v.id.slice("stackexchange:".length) }));
      } else if (v.id.startsWith("discourse:")) {
        const base = v.url ?? `https://${v.id.slice("discourse:".length)}`;
        jobs.push(() => searchDiscourse({ ...common, baseUrl: base, limit: 20 }));
      } else if (v.id === "x:all") {
        // Returns [] without a token rather than throwing, so a missing X key costs nothing.
        jobs.push(() => searchX({ query: phrase, limit: 25, timeoutMs: PER_SOURCE_TIMEOUT_MS }));
      }
    }
  }

  const raw = await trace.stage(`extract:fanout:w${wave}`, jobs.length, async () => {
    const { results, timeouts, errors } = await settleWithBudget(jobs, FANOUT_BUDGET_MS);
    const unique = new Map<string, Candidate>();
    for (const c of results) unique.set(c.id, c);
    return { out: [...unique.values()], drops: { source_timeout: timeouts, source_error: errors } };
  });

  if (raw.length === 0) return { leads: [] };

  const seen = new Set(excludeAuthors.map((a) => a.toLowerCase()));
  const fresh = raw.filter((c) => !seen.has(c.author.toLowerCase()));

  const filtered = await trace.stage(`extract:filter:w${wave}`, fresh.length, async () => {
    const { kept, drops } = cheapFilter(fresh, lexicon);
    return { out: kept, drops: { ...drops, dupe_author: (drops.dupe_author ?? 0) + (raw.length - fresh.length) } };
  });

  if (filtered.length === 0) return { leads: [] };

  const toScore = filtered.slice(0, MAX_TO_SCORE);
  const leads = await trace.stage(`extract:score:w${wave}`, toScore.length, async () => {
    try {
      const { leads: scored, drops } = await scoreCandidates({ candidates: toScore, whatYouSell, problem, buyers, maxLeads });
      return { out: scored, drops };
    } catch (err) {
      // Partial results beat a timeout: if scoring falls over, nothing ships from this shard
      // rather than shipping unqualified candidates dressed up as leads.
      return { out: [] as ScoredLead[], note: `scoring failed: ${err instanceof Error ? err.message : err}` };
    }
  });

  return { leads };
}

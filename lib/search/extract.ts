import { searchPostsInSubreddit } from "./reddit";
import { searchHackerNews } from "./hackernews";
import { searchLemmy } from "./lemmy";
import { searchX } from "./x";
import { searchDiscourse } from "./discourse";
import { searchBluesky } from "./bluesky";
import { searchStackExchange } from "./stackexchange";
import { searchQuora } from "./quora";
import { cheapFilter } from "./filter";
import { scoreCandidates } from "./score";
import { settleWithBudget, Trace } from "./trace";
import { Deadline } from "./deadline";
import { buildPhrasePool, planWave } from "./waves";
import { toSearchQueries } from "./queries";
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
const SCORE_BUDGET_MS = 25_000;
// Below this there is not enough time left for the model to read a batch and answer, so the run
// returns what it has instead of starting a call that will be cut off mid-flight.
const SCORE_MIN_MS = 8_000;
// Held back for serialising the response and writing results — the run must never spend its last
// millisecond inside a model call.
const RESPONSE_RESERVE_MS = 2_000;
// Cap on what reaches the expensive pass per shard. The cheap filter ranks by signal first, so
// this is a "best N", not a truncation of something unsorted.
const MAX_TO_SCORE = 40;

// Takes the best N while keeping as many DIFFERENT communities represented as possible.
//
// A plain `slice(0, N)` on a signal-ranked list is quietly biased: one busy subreddit that matches
// the query well can fill the entire batch, and the run then reports leads from one place as though
// it had searched everywhere. Ten people across eight communities is a better answer than ten
// people from one — it tests more of the map, and it is far more useful to a founder deciding where
// to spend their time.
//
// Round-robin by venue preserves the ranking within each community (the list arrives sorted) while
// guaranteeing every community gets a turn before any community gets a second.
export function spreadAcrossVenues(candidates: Candidate[], limit: number): Candidate[] {
  const byVenue = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const bucket = byVenue.get(c.venueId);
    if (bucket) bucket.push(c);
    else byVenue.set(c.venueId, [c]);
  }
  // Venues ordered by their own strongest candidate, so the best community still goes first.
  const buckets = [...byVenue.values()];
  const out: Candidate[] = [];
  for (let round = 0; out.length < limit; round++) {
    let placed = false;
    for (const bucket of buckets) {
      if (round >= bucket.length) continue;
      out.push(bucket[round]);
      placed = true;
      if (out.length >= limit) break;
    }
    if (!placed) break;
  }
  return out;
}

export async function extractLeads(opts: {
  venues: Venue[];
  lexicon: LexiconInput;
  whatYouSell: string;
  problem: string;
  buyers: { name: string; desc: string }[];
  trace: Trace;
  // Which slice of the phrase pool and which page of results this wave should cover.
  wave?: number;
  // Authors already shipped by earlier waves/shards, so a later wave spends its budget on new
  // people instead of re-surfacing and re-scoring the same ones.
  excludeAuthors?: string[];
  /** The request's clock. Without one, stages run to their own budgets and the total is unbounded. */
  deadline?: Deadline;
}): Promise<{ leads: ScoredLead[] }> {
  const { venues, lexicon, whatYouSell, problem, buyers, trace, wave = 0, excludeAuthors = [], deadline } = opts;

  const searchable = venues.filter((v) => v.searchable);

  // Interleave seeking and problem phrases so every wave gets a mix of "shopping right now" and
  // "describing the pain". The previous build sliced this pool down to two entries AFTER
  // concatenating, which meant problemPhrases were never searched at all.
  const phrases = buildPhrasePool(lexicon.seekingPhrases, lexicon.problemPhrases);
  if (phrases.length === 0 || searchable.length === 0) return { leads: [] };
  const { phrases: wavePhrases, page } = planWave(phrases, wave);
  // Keyword engines, not semantic ones: a six-word phrase matches almost nothing, so search on the
  // two or three distinctive words it reduces to.
  const queries = toSearchQueries(wavePhrases);

  const jobs: (() => Promise<Candidate[]>)[] = [];
  for (const v of searchable) {
    for (const phrase of queries) {
      const common = { query: phrase, windowDays: lexicon.relevanceWindowDays, limit: 25, timeoutMs: PER_SOURCE_TIMEOUT_MS, page };
      if (v.id.startsWith("reddit:")) {
        jobs.push(() => searchPostsInSubreddit({ ...common, slug: v.id.slice("reddit:".length) }));
      } else if (v.id === "hn:all") {
        jobs.push(() => searchHackerNews(common));
      } else if (v.id === "lemmy:all") {
        jobs.push(() => searchLemmy({ ...common, limit: 20 }));
      } else if (v.id === "bsky:all") {
        jobs.push(() => searchBluesky({ ...common, limit: 50 }));
      } else if (v.id === "quora:all") {
        // Fewer per query than the API-backed sources: each result costs a page fetch, so this is
        // deliberately shallow rather than letting one slow source eat the fan-out budget.
        jobs.push(() => searchQuora({ ...common, limit: 6 }));
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
    const fanoutMs = deadline ? deadline.budgetFor(FANOUT_BUDGET_MS, RESPONSE_RESERVE_MS) : FANOUT_BUDGET_MS;
    const { results, timeouts, errors } = await settleWithBudget(jobs, fanoutMs);
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

  const toScore = spreadAcrossVenues(filtered, MAX_TO_SCORE);
  const leads = await trace.stage(`extract:score:w${wave}`, toScore.length, async () => {
    // Skipping is the honest outcome when there isn't room: starting a call that gets cut off
    // mid-flight costs the same and returns nothing, and takes the trace down with it.
    if (deadline && !deadline.hasRoomFor(SCORE_MIN_MS, RESPONSE_RESERVE_MS)) {
      return {
        out: [] as ScoredLead[],
        note: `skipped: ${Math.round(deadline.remaining() / 1000)}s left, needs ${SCORE_MIN_MS / 1000}s`,
      };
    }
    try {
      const { leads: scored, drops } = await scoreCandidates({
        candidates: toScore,
        whatYouSell,
        problem,
        buyers,
        timeoutMs: deadline ? deadline.budgetFor(SCORE_BUDGET_MS, RESPONSE_RESERVE_MS) : SCORE_BUDGET_MS,
      });
      return { out: scored, drops };
    } catch (err) {
      // Partial results beat a timeout: if scoring falls over, nothing ships from this shard
      // rather than shipping unqualified candidates dressed up as leads.
      return { out: [] as ScoredLead[], note: `scoring failed: ${err instanceof Error ? err.message : err}` };
    }
  });

  return { leads };
}

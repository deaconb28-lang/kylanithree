import { searchPostsInSubreddit } from "./reddit";
import { searchHackerNews } from "./hackernews";
import { cheapFilter } from "./filter";
import { scoreCandidates } from "./score";
import { settleWithBudget, Trace } from "./trace";
import type { Candidate, LexiconInput, ScoredLead, Venue } from "./types";

// Stage 2-4 for one shard of venues. Kept shard-shaped on purpose: the client fires several of
// these in parallel so results stream in as each returns, and each individual request stays well
// inside Vercel's 60s function ceiling instead of one long run racing it.

const PER_SOURCE_TIMEOUT_MS = 4000;
const FANOUT_BUDGET_MS = 6000;
// Cap what reaches the model. The cheap filter ranks by signal, so this is a "best N", not a
// truncation of something unsorted.
const MAX_TO_SCORE = 30;

export async function extractLeads(opts: {
  venues: Venue[];
  lexicon: LexiconInput;
  whatYouSell: string;
  problem: string;
  buyers: { name: string; desc: string }[];
  trace: Trace;
  maxLeads?: number;
}): Promise<{ leads: ScoredLead[] }> {
  const { venues, lexicon, whatYouSell, problem, buyers, trace, maxLeads } = opts;

  const searchable = venues.filter((v) => v.searchable);
  // Two phrases per venue keeps the fan-out wide across communities rather than deep on one, which
  // matters more for coverage than exhausting every phrase in a single subreddit.
  const phrases = [...lexicon.seekingPhrases.slice(0, 2), ...lexicon.problemPhrases.slice(0, 2)].filter(Boolean);

  // Dispatch per platform. A venue whose platform has no extractor (Slack, Discord — private and
  // not searchable from outside) simply contributes no jobs rather than failing the shard.
  const jobs: (() => Promise<Candidate[]>)[] = [];
  for (const v of searchable) {
    for (const phrase of phrases.slice(0, 2)) {
      if (v.id.startsWith("reddit:")) {
        const slug = v.id.slice("reddit:".length);
        jobs.push(() =>
          searchPostsInSubreddit({
            slug,
            query: phrase,
            windowDays: lexicon.relevanceWindowDays,
            limit: 25,
            timeoutMs: PER_SOURCE_TIMEOUT_MS,
          }),
        );
      } else if (v.id === "hn:all") {
        jobs.push(() =>
          searchHackerNews({
            query: phrase,
            windowDays: lexicon.relevanceWindowDays,
            limit: 25,
            timeoutMs: PER_SOURCE_TIMEOUT_MS,
          }),
        );
      }
    }
  }

  const raw = await trace.stage("extract:fanout", jobs.length, async () => {
    const { results, timeouts, errors } = await settleWithBudget(jobs, FANOUT_BUDGET_MS);
    const unique = new Map<string, Candidate>();
    for (const c of results) unique.set(c.id, c);
    return { out: [...unique.values()], drops: { source_timeout: timeouts, source_error: errors } };
  });

  if (raw.length === 0) return { leads: [] };

  const filtered = await trace.stage("extract:filter", raw.length, async () => {
    const { kept, drops } = cheapFilter(raw, lexicon);
    return { out: kept, drops };
  });

  if (filtered.length === 0) return { leads: [] };

  const toScore = filtered.slice(0, MAX_TO_SCORE);
  const leads = await trace.stage("extract:score", toScore.length, async () => {
    try {
      const { leads: scored, drops } = await scoreCandidates({
        candidates: toScore,
        whatYouSell,
        problem,
        buyers,
        maxLeads,
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

import { resolveVenues } from "./search/venues";
import { extractLeads } from "./search/extract";
import { Trace } from "./search/trace";
import type { LexiconInput, RunTrace, ScoredLead, Venue } from "./search/types";

// Thin orchestrator over the real pipeline in lib/search/*. The onboarding flow does NOT call this
// — Step5Search drives resolve-venues and extract-leads as separate parallel requests so venues
// render immediately and leads stream in behind them. This exists for the non-interactive callers
// (the "search again" action, and finalizeOnboarding's fallback when a client arrives with no
// pre-computed seed), where one call returning one result is the simpler contract.

export type GeneratedSeed = {
  leads: ScoredLead[];
  communities: Venue[];
  trace?: RunTrace;
};

export type SeedInput = {
  url: string;
  whatYouSell: string;
  problem?: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category?: string;
  keywords?: string[];
  nicheKey?: string;
  problemPhrases?: string[];
  seekingPhrases?: string[];
  negativeTerms?: string[];
  relevanceWindowDays?: number;
};

// Older campaigns (and any client that predates the lexicon fields) only carry `keywords`. Falling
// back to those keeps re-search working for them rather than failing on a missing field, at the
// cost of a coarser search — worth being explicit about rather than silently degrading.
export function lexiconFrom(input: SeedInput): LexiconInput {
  const keywords = input.keywords ?? [];
  return {
    problemPhrases: input.problemPhrases?.length ? input.problemPhrases : keywords,
    seekingPhrases: input.seekingPhrases?.length ? input.seekingPhrases : keywords,
    negativeTerms: input.negativeTerms ?? [],
    relevanceWindowDays: Math.min(365, Math.max(7, input.relevanceWindowDays ?? 60)),
  };
}

export function nicheKeyFrom(input: SeedInput): string {
  if (input.nicheKey) return input.nicheKey;
  const basis = `${input.buyers[0]?.name ?? "buyer"}-${input.keywords?.[0] ?? input.category ?? "general"}`;
  return basis.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "general";
}

export async function generateCampaignSeed(input: SeedInput): Promise<GeneratedSeed> {
  const trace = new Trace();
  const lexicon = lexiconFrom(input);

  const { venues } = await resolveVenues({
    nicheKey: nicheKeyFrom(input),
    buyers: input.buyers,
    whatYouSell: input.whatYouSell,
    lexiconTerms: [...lexicon.seekingPhrases, ...lexicon.problemPhrases],
    trace,
  });

  if (venues.length === 0) {
    trace.log("generateCampaignSeed");
    return { leads: [], communities: [], trace: trace.toJSON() };
  }

  const { leads } = await extractLeads({
    venues,
    lexicon,
    whatYouSell: input.whatYouSell,
    problem: input.problem ?? input.whatYouSell,
    buyers: input.buyers,
    trace,
  });

  trace.log("generateCampaignSeed");
  return { leads, communities: venues, trace: trace.toJSON() };
}

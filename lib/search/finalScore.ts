import { INTENT_WEIGHT, type IntentType } from "./intent";

// The final score and tier assignment. See docs/search-architecture.md §5.4.
//
// Five weighted components, all in 0-1, so the total is in 0-1 and every point is attributable.
// Attribution is the requirement: a founder asking "why is this person first" must get an answer
// from the breakdown, not from a shrug.

export const WEIGHTS = {
  rerank: 0.55,
  intent: 0.2,
  recency: 0.1,
  contactability: 0.1,
  activity: 0.05,
} as const;

export type Contactability = "unknown" | "dm" | "verified";

const CONTACTABILITY_VALUE: Record<Contactability, number> = {
  unknown: 0,
  dm: 0.5,
  verified: 1,
};

/** Exponential decay with a ~540-day half-life-ish shape. Evergreen pain genuinely ages well. */
export function recencyDecay(postedAt: Date, now: Date = new Date()): number {
  const days = Math.max(0, (now.getTime() - postedAt.getTime()) / 86_400_000);
  return Math.exp(-days / 540);
}

export type ScoreInput = {
  /** Cross-encoder score against the brief's icpSummary, 0-1. */
  rerankScore: number;
  intentType: IntentType;
  postedAt: Date;
  contactability: Contactability;
  /** Proxy for "is this a real active human", 0-1. Filters bots; does not rank leads. */
  activityScore: number;
  now?: Date;
};

export type ScoreBreakdown = {
  rerank: number;
  intent: number;
  recency: number;
  contactability: number;
  activity: number;
};

export type FinalScore = {
  total: number;
  breakdown: ScoreBreakdown;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export function finalScore(input: ScoreInput): FinalScore {
  const breakdown: ScoreBreakdown = {
    rerank: WEIGHTS.rerank * clamp01(input.rerankScore),
    intent: WEIGHTS.intent * clamp01(INTENT_WEIGHT[input.intentType] ?? 0),
    recency: WEIGHTS.recency * clamp01(recencyDecay(input.postedAt, input.now)),
    contactability: WEIGHTS.contactability * CONTACTABILITY_VALUE[input.contactability],
    activity: WEIGHTS.activity * clamp01(input.activityScore),
  };
  const total = breakdown.rerank + breakdown.intent + breakdown.recency + breakdown.contactability + breakdown.activity;
  return { total, breakdown };
}

export type Tier = "verified" | "standard" | "basic" | "dropped";

export const DROP_FLOOR = 0.3;
const STANDARD_FLOOR = 0.48;
const VERIFIED_FLOOR = 0.72;

/**
 * Tier assignment, which feeds the credits rate card directly.
 *
 * The drop floor is the part that matters. Shipping weak leads to hit a number is the fastest way
 * to lose a paying user, and under a metered model you would be charging them for the privilege —
 * so below the floor a lead is never shown and never charged.
 */
export function assignTier(total: number, hasReachableContact: boolean): Tier {
  if (total < DROP_FLOOR) return "dropped";
  if (total >= VERIFIED_FLOOR && hasReachableContact) return "verified";
  if (total >= STANDARD_FLOOR) return "standard";
  return "basic";
}

/**
 * Contactability isn't known until enrichment has run, so a search scores twice: once without it,
 * once when contacts land. This is the "before" pass — it deliberately leaves the contactability
 * component at zero rather than guessing, so the ordering visibly improves as enrichment completes
 * instead of appearing to change its mind.
 */
export function preEnrichmentScore(input: Omit<ScoreInput, "contactability">): FinalScore {
  return finalScore({ ...input, contactability: "unknown" });
}

/**
 * Coverage check that decides whether the live-crawl fallback should fire. Any one of these means
 * the index does not cover this niche — which is expected, not a fault: nothing can be pre-indexed
 * exhaustively and new verticals arrive constantly.
 */
export function needsFallback(opts: {
  scores: number[];
  distinctSources: number;
  requestedCount: number;
}): { trigger: boolean; reason: string | null } {
  const strong = opts.scores.filter((s) => s >= STANDARD_FLOOR).length;
  if (strong < 0.4 * opts.requestedCount) {
    return { trigger: true, reason: `only ${strong} strong results against a target of ${opts.requestedCount}` };
  }
  if (opts.distinctSources < 3) {
    return { trigger: true, reason: `results came from only ${opts.distinctSources} source(s)` };
  }
  const best = opts.scores.length ? Math.max(...opts.scores) : 0;
  if (best < 0.55) {
    return { trigger: true, reason: `best result scored only ${best.toFixed(2)}` };
  }
  return { trigger: false, reason: null };
}

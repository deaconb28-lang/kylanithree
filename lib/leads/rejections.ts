import { getDb } from "../mongodb";

// Why a founder dropped a lead — the relevance loop, and the thing that makes the product get
// better at a specific business rather than better in general.
//
// Deliberately separate from suppression, which they resemble and are not. Suppression means "never
// contact this human again" and is a compliance record: an unsubscribe, a bounce, an existing
// customer. A rejection means "this was the wrong person to show me" and is a training signal. One
// protects a person, the other corrects a search — collapsing them would either spam people whose
// lead was merely off-target, or silently stop finding a whole category because one person bounced.
//
// One tap, no free text. A reason chooser that accepts prose gets prose, and prose cannot be
// aggregated into a ranking signal — which is the entire point of collecting it.

// The reason vocabulary itself lives in `./rejectionReasons`, which imports nothing — the client
// components that render the reason row must not pull the Mongo driver in with it. Re-exported here
// so server code has one import for the whole feature.
export {
  REJECTION_REASONS,
  REJECTION_REASON_LABELS,
  type RejectionReason,
} from "./rejectionReasons";

import type { RejectionReason } from "./rejectionReasons";

export interface LeadRejectionDoc {
  userId: string;
  campaignId: string;
  leadId: string;
  reason: RejectionReason;
  /** Copied off the lead at rejection time, so the signal survives the lead being deleted. */
  hypothesisKey?: string;
  source?: string;
  createdAt: Date;
}

export async function LeadRejections() {
  return (await getDb()).collection<LeadRejectionDoc>("lead_rejections");
}

export async function ensureRejectionIndexes(): Promise<void> {
  try {
    const col = await LeadRejections();
    // The two questions this collection answers: "what has this campaign rejected" and "is this
    // particular lead already rejected".
    await col.createIndex({ userId: 1, campaignId: 1, createdAt: -1 }, { name: "rejection_recent" });
    await col.createIndex({ leadId: 1 }, { name: "rejection_by_lead" });
  } catch (err) {
    // Non-fatal, like every other index in this codebase: a missing index makes a query slower,
    // while a throw here would take down the route that is trying to record feedback.
    console.error("[rejections] index not created:", err instanceof Error ? err.message : err);
  }
}

export interface RejectionSignal {
  /** How often each source has been rejected, keyed by source name. */
  bySource: Record<string, number>;
  /** How often each buyer hypothesis has been rejected, keyed by hypothesis key. */
  byHypothesis: Record<string, number>;
  /** How often each reason was given, for the activity log. */
  byReason: Record<string, number>;
  total: number;
}

/**
 * Everything this campaign has rejected, aggregated for ranking.
 *
 * Returns empty rather than throwing: ranking that works slightly worse is survivable, a queue that
 * will not load is not. Same trade the whole codebase makes for its optional signals.
 */
export async function rejectionSignal(userId: string, campaignId: string): Promise<RejectionSignal> {
  const empty: RejectionSignal = { bySource: {}, byHypothesis: {}, byReason: {}, total: 0 };
  try {
    const rows = await (await LeadRejections()).find({ userId, campaignId }).limit(2000).toArray();
    const signal: RejectionSignal = { bySource: {}, byHypothesis: {}, byReason: {}, total: rows.length };
    for (const r of rows) {
      if (r.source) signal.bySource[r.source] = (signal.bySource[r.source] ?? 0) + 1;
      if (r.hypothesisKey) signal.byHypothesis[r.hypothesisKey] = (signal.byHypothesis[r.hypothesisKey] ?? 0) + 1;
      signal.byReason[r.reason] = (signal.byReason[r.reason] ?? 0) + 1;
    }
    return signal;
  } catch (err) {
    console.error("[rejections] aggregate failed:", err instanceof Error ? err.message : err);
    return empty;
  }
}

/** Rejections needed against one source before its leads are demoted at all. */
const SOURCE_PATIENCE = 3;
/** The most a source or buyer can be demoted, as a multiplier on the lead's score. */
const MAX_DEMOTION = 0.45;

/**
 * How much to demote a lead, given what this founder has already rejected.
 *
 * A multiplier rather than a filter, and bounded, on purpose. Dropping a source outright after a
 * few rejections would let three impatient taps delete a community that was actually productive,
 * with no way for the founder to see why it went quiet — the same silent-failure shape this
 * codebase keeps having to remove. Demotion is recoverable; deletion is not.
 *
 * `bad_source` is not weighted more heavily than the others here. A founder tapping it is telling
 * us about the source, but a run of "wrong role" from one community says the same thing, and the
 * aggregate is a better judge of that than the label they happened to pick.
 */
export function demotionFor(
  lead: { source?: string; hypothesisKey?: string },
  signal: RejectionSignal,
): number {
  const sourceHits = lead.source ? (signal.bySource[lead.source] ?? 0) : 0;
  const buyerHits = lead.hypothesisKey ? (signal.byHypothesis[lead.hypothesisKey] ?? 0) : 0;
  const hits = Math.max(sourceHits, buyerHits);
  if (hits < SOURCE_PATIENCE) return 1;
  // Each rejection past the patience threshold costs 12%, floored at MAX_DEMOTION.
  return Math.max(MAX_DEMOTION, 1 - (hits - SOURCE_PATIENCE + 1) * 0.12);
}

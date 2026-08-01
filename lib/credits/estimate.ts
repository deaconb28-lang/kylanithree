import { creditsForLead } from "./rateCard";

// Pre-flight estimate. Required surface, not a nice-to-have: people need to predict cost before
// they commit, and a metered product that only tells you the bill afterwards is one nobody trusts.
//
// Estimate wide, charge narrow. The range must comfortably contain the real number — an estimate
// that undershoots is far worse than one that overshoots, because the first is a surprise on the
// invoice and the second is a pleasant one.

export type SearchEstimate = {
  leadsLow: number;
  leadsHigh: number;
  creditsLow: number;
  creditsHigh: number;
  /** Plain-language line for the UI. */
  summary: string;
};

// Observed shape of a real run: most leads resolve to basic (a handle and a post), a minority to
// standard, and verified is rare without a contact-unlock step. Deliberately conservative — the
// mix is assumed richer than typical so the estimate errs high.
const MIX = { basic: 0.6, standard: 0.3, verified: 0.1 };

const AVG_CREDITS_PER_LEAD =
  creditsForLead("basic") * MIX.basic + creditsForLead("standard") * MIX.standard + creditsForLead("verified") * MIX.verified;

/**
 * Estimates a search from how much ground it will actually cover. Venue count and wave count are
 * what determine yield, so they are the inputs — not a guess keyed on the niche.
 */
export function estimateSearch(opts: {
  searchableVenues: number;
  maxWaves: number;
  /** Already-seen people cost nothing, so a repeat search into the same niche is much cheaper. */
  alreadyChargedFingerprints?: number;
}): SearchEstimate {
  const { searchableVenues, maxWaves, alreadyChargedFingerprints = 0 } = opts;

  // Roughly one to three qualifying people per venue per wave once the filters have run. Wide on
  // purpose: real yield varies more with how loud a niche is than with anything we control.
  const rawLow = Math.max(0, searchableVenues * maxWaves * 0.4);
  const rawHigh = Math.max(0, searchableVenues * maxWaves * 1.6);

  // Dedup only reduces what we bill, never what we show — so it comes off the credit range, not
  // the lead range.
  const billableLow = Math.max(0, rawLow - alreadyChargedFingerprints);
  const billableHigh = Math.max(0, rawHigh - alreadyChargedFingerprints);

  const leadsLow = Math.round(rawLow);
  const leadsHigh = Math.round(rawHigh);
  const creditsLow = Math.round(billableLow * AVG_CREDITS_PER_LEAD);
  const creditsHigh = Math.round(billableHigh * AVG_CREDITS_PER_LEAD);

  const summary =
    leadsHigh === 0
      ? "No searchable communities resolved yet, so this search would cost nothing."
      : `This search will return roughly ${leadsLow}–${leadsHigh} leads, est. ${creditsLow}–${creditsHigh} credits.`;

  return { leadsLow, leadsHigh, creditsLow, creditsHigh, summary };
}

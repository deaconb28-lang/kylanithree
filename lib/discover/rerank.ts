import type { DiscoverLead } from "./collections";

/**
 * Re-orders the leads already on screen against a corrected set of keywords.
 *
 * This is what "correction over prediction" means in practice: fixing a wrong inference re-ranks
 * what is there, it does not restart the flow. Nobody who has already waited should have to wait
 * again because the first guess was off by a word.
 *
 * A lead matching none of the corrected keywords is demoted, never dropped. They are a real person
 * who really said that; the correction changes what we are looking for, it is not evidence that
 * they were imaginary. `score` is left exactly as the pass that found it set it — this sorts by
 * agreement with the corrected words first and falls back to the original ranking, rather than
 * inventing a new number that would then be indistinguishable from a real one.
 */
export function rerank(leads: DiscoverLead[], keywords: string[]): DiscoverLead[] {
  // Index-aligned with `keywords` rather than filtered down, so a surviving match can be reported
  // back in the founder's own words — the card says `matched "..."` and it has to be their phrase.
  const needles = keywords.map((k) => k.trim().toLowerCase());

  return leads
    .map((lead) => {
      const haystack = lead.excerpt.toLowerCase();
      return { ...lead, matchedFor: keywords.filter((_, i) => needles[i].length > 2 && haystack.includes(needles[i])) };
    })
    .sort((a, b) => b.matchedFor.length - a.matchedFor.length || b.score - a.score);
}

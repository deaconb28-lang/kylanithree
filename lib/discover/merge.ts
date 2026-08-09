import type { DiscoverLead } from "./collections";

// How pass 2 results join pass 1 results on screen.
//
// Three rules, and they are all about not betraying someone who is mid-read:
//   1. Dedupe by PERSON, never by post URL. The same human found on HN and Stack Exchange is one
//      lead; keyed on URL they would appear twice and the count would be a lie.
//   2. Pass-1 leads get no privilege in the ranking. If the deep pass judges them weaker, they get
//      demoted — otherwise pass 1 would be padding the top of the list by construction.
//   3. A card the user is reading or has touched does not move. Re-ranking around a pinned card is
//      correct; re-ranking THROUGH it makes the page feel like it is fighting you.

export type MergeInput = {
  existing: DiscoverLead[];
  incoming: DiscoverLead[];
  /** Fingerprints the user has interacted with or is currently reading. These stay put. */
  pinned?: Set<string>;
};

/**
 * Merges a batch of new leads into the list on screen.
 *
 * Returns the full ordered list plus which fingerprints are newly added, so the client can animate
 * arrivals without diffing the whole array.
 */
export function mergeLeads({ existing, incoming, pinned = new Set() }: MergeInput): {
  leads: DiscoverLead[];
  added: string[];
} {
  const byPerson = new Map<string, DiscoverLead>();
  for (const l of existing) byPerson.set(l.personFingerprint, l);

  const added: string[] = [];
  for (const l of incoming) {
    const prior = byPerson.get(l.personFingerprint);
    if (!prior) {
      byPerson.set(l.personFingerprint, l);
      added.push(l.personFingerprint);
      continue;
    }
    // Same person, seen again. Keep the stronger evidence post, and keep the ORIGINAL foundInPass
    // so shallow survival stays measurable — a pass-1 lead that pass 2 also finds is still a
    // pass-1 lead for the purposes of that metric.
    if (l.score > prior.score) {
      byPerson.set(l.personFingerprint, { ...l, foundInPass: prior.foundInPass });
    } else if (!prior.contact && l.contact) {
      // Enrichment arriving for a lead we already show: take the contact, leave everything else.
      byPerson.set(l.personFingerprint, { ...prior, contact: l.contact });
    }
  }

  const all = [...byPerson.values()];

  // Pinned cards hold their exact index; everything else sorts by score and fills the gaps around
  // them. This is what lets the list re-rank continuously without a card jumping under a cursor.
  const pinnedEntries = all
    .map((l, i) => ({ lead: l, index: existing.findIndex((e) => e.personFingerprint === l.personFingerprint), i }))
    .filter((e) => pinned.has(e.lead.personFingerprint) && e.index >= 0);

  const free = all
    .filter((l) => !pinned.has(l.personFingerprint) || !pinnedEntries.some((p) => p.lead.personFingerprint === l.personFingerprint))
    .sort((a, b) => b.score - a.score);

  const out: (DiscoverLead | undefined)[] = [];
  for (const p of pinnedEntries) out[p.index] = p.lead;
  let cursor = 0;
  for (const l of free) {
    while (out[cursor] !== undefined) cursor++;
    out[cursor] = l;
  }

  return { leads: out.filter((l): l is DiscoverLead => l !== undefined), added };
}

/**
 * Share of pass-1 leads still in the top 20 once pass 2 has finished.
 *
 * The number that says whether pass 1 is seeding the screen or padding it. Low means its source
 * selection is wrong — it is finding people the deep pass then judges irrelevant, which is worse
 * than showing fewer leads for longer.
 */
export function shallowSurvival(final: DiscoverLead[], passOneFingerprints: string[]): number | null {
  if (passOneFingerprints.length === 0) return null;
  const topTwenty = new Set(final.slice(0, 20).map((l) => l.personFingerprint));
  const survivors = passOneFingerprints.filter((fp) => topTwenty.has(fp)).length;
  return Math.round((survivors / passOneFingerprints.length) * 100);
}

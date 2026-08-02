import { getDb } from "../mongodb";

// Precomputed niche → communities, so pass 1 never spends its 8s budget discovering where to look.
//
// This is the difference between pass 1 being a lookup and being a search. The deep pass already
// resolves venues properly and pays a model call to do it; this records that answer against the
// niche so the NEXT person in the same niche gets it for free. Cache warms itself from real usage
// rather than needing to be curated up front.

export interface NicheMapDoc {
  nicheKey: string;
  /** Venue ids in the same vocabulary the sources use — "hn:all", "stackexchange:workplace". */
  venueIds: string[];
  /** How many runs contributed to this entry. Higher means more trustworthy. */
  observations: number;
  updatedAt: Date;
  expiresAt: Date;
}

async function NicheMap() {
  return (await getDb()).collection<NicheMapDoc>("nicheMap");
}

// The floor pass 1 falls back to when a niche has never been seen. Chosen on latency-to-signal,
// which is the only thing that matters inside an 8s budget:
//   • HN Algolia — one endpoint, no auth, consistently sub-second, spans every technical topic.
//   • Stack Exchange — one endpoint per site, fast, and every item is a QUESTION, so the intent
//     density is higher than any feed.
// Deliberately NOT Discourse (per-topic fetches, seconds each) and not Quora (a page fetch per
// result). Those earn their place in pass 2 where there is time for them.
//
// Widened from three. These are only reached when the corpus comes back thin, and each one is a
// parallel request inside the live budget rather than a sequential one, so breadth costs latency
// far more slowly than it costs coverage. Every site here is high-question-density and answers
// fast; the slow platforms still stay out of pass 1 entirely.
const FAST_DEFAULTS = [
  "hn:all",
  "stackexchange:softwarerecs",
  "stackexchange:workplace",
  "stackexchange:pm",
  "stackexchange:webmasters",
  "stackexchange:ux",
  "stackexchange:sqa",
  "stackexchange:devops",
];

const TTL_DAYS = 30;

/**
 * The communities pass 1 should query for this niche.
 *
 * Always returns something — an unseen niche gets the fast defaults rather than an empty list,
 * because a thin real result beats a blank screen and pass 2 will widen it within seconds.
 */
export async function communitiesForNiche(nicheKey: string): Promise<{ venueIds: string[]; cached: boolean }> {
  try {
    const map = await NicheMap();
    const hit = await map.findOne({ nicheKey, expiresAt: { $gt: new Date() } });
    if (hit?.venueIds?.length) {
      // Defaults are appended, not replaced: a cached niche should still get the reliably fast
      // sources, since the cache records what the DEEP pass found and that skews slower.
      const merged = [...new Set([...hit.venueIds, ...FAST_DEFAULTS])];
      // Was 6. The cap exists to bound the live fallback's fan-out, not the corpus read — the
      // corpus route searches every crawled community regardless of what is listed here.
      return { venueIds: merged.slice(0, 16), cached: true };
    }
  } catch (err) {
    console.error("[nicheMap] lookup failed, using defaults:", err instanceof Error ? err.message : err);
  }
  return { venueIds: FAST_DEFAULTS, cached: false };
}

/**
 * Records what the deep pass resolved, so the next run in this niche starts warm.
 *
 * Merges rather than overwrites: two founders in the same niche will surface overlapping but not
 * identical communities, and the union is a better map than whichever ran most recently.
 */
export async function recordNicheCommunities(nicheKey: string, venueIds: string[]): Promise<void> {
  if (!nicheKey || venueIds.length === 0) return;
  try {
    const map = await NicheMap();
    const existing = await map.findOne({ nicheKey });
    const merged = [...new Set([...(existing?.venueIds ?? []), ...venueIds])].slice(0, 40);
    await map.updateOne(
      { nicheKey },
      {
        $set: {
          venueIds: merged,
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000),
        },
        $inc: { observations: 1 },
        $setOnInsert: { nicheKey },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error("[nicheMap] write failed:", err instanceof Error ? err.message : err);
  }
}

export async function ensureNicheMapIndexes(): Promise<void> {
  try {
    const map = await NicheMap();
    await map.createIndex({ nicheKey: 1 }, { unique: true, name: "niche_key" });
  } catch (err) {
    console.error("[nicheMap] index not created:", err instanceof Error ? err.message : err);
  }
}

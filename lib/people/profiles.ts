import { People } from "../ingest/collections";

// The read side of the person crawler.
//
// `lib/ingest/people.ts` has been filling the `people` collection every tick — display names, bios
// in the person's own words, profile links, account age, reputation — and until this file existed
// NOTHING read any of it. It was a write-only store: real work, done continuously, that no founder
// ever saw. A lead rendered as `authorRef` and a venue name is a row; a lead rendered with the
// person's own bio and a link to their profile is a person, and the difference is entirely in
// whether anyone joins these two collections together.
//
// The join is deliberately NOT done inside retrieval. `$search` and `$vectorSearch` must be the
// first stage of an aggregation on a single collection, so a `$lookup` into `people` would have to
// come after the index read anyway — at which point it is the same work as this, minus the ability
// to skip it when the budget is gone.

/** What a lead card is allowed to know about a person. Every field is optional on purpose. */
export interface PublicPerson {
  fingerprint: string;
  platform: string;
  handle: string;
  displayName?: string;
  /** Their own words. Never generated, never summarised — absent when they have not written one. */
  bio?: string;
  profileUrl?: string;
  accountAgeDays?: number;
  reputation?: number;
  /** As the platform reports it, which is broader than what we crawled. */
  platformPostCount?: number;
  /** How many of their posts are in our corpus. Ours, not theirs — a different number. */
  postCount?: number;
}

const PROJECTION = {
  fingerprint: 1,
  platform: 1,
  handle: 1,
  displayName: 1,
  bio: 1,
  profileUrl: 1,
  accountAgeDays: 1,
  reputation: 1,
  platformPostCount: 1,
  postCount: 1,
} as const;

/**
 * Look up many people at once.
 *
 * Returns an empty map rather than throwing, and omits anyone who is not in the collection rather
 * than mapping them to null — absent means "we do not know", which is the only honest reading for
 * a person the enrichment backlog has not reached yet. A lead with no profile still ships; a search
 * that fails because a decoration could not be loaded would be a much worse trade.
 */
export async function peopleByFingerprint(fingerprints: string[]): Promise<Map<string, PublicPerson>> {
  const out = new Map<string, PublicPerson>();
  const unique = [...new Set(fingerprints.filter(Boolean))];
  if (unique.length === 0) return out;

  try {
    const rows = await (await People())
      .find({ fingerprint: { $in: unique } })
      .project<PublicPerson>(PROJECTION)
      .toArray();
    for (const r of rows) {
      // A row that has never been enriched carries a fingerprint, a platform and a handle and
      // nothing else. That is still worth returning — `postCount` alone supports "seen 4 times" —
      // so there is no "is it enriched" filter here.
      out.set(r.fingerprint, r);
    }
  } catch (err) {
    console.error("[people] hydrate failed:", err instanceof Error ? err.message : err);
  }
  return out;
}

const PLATFORM_LABEL: Record<string, string> = {
  hn: "Hacker News",
  stackexchange: "Stack Exchange",
  discourse: "the forum",
  lemmy: "Lemmy",
  bluesky: "Bluesky",
  reddit: "Reddit",
};

/**
 * One line about how established this account is, or nothing.
 *
 * Returns undefined when there is nothing measured — never "new account", which is a claim, and
 * never "0 years", which is what a missing `accountAgeDays` would render as if it were defaulted.
 * The whole reason `lib/ingest/people.ts` leaves that field absent is so this can tell the
 * difference between a ten-year account we have not looked up and one that joined today.
 */
export function describeTenure(person: Pick<PublicPerson, "platform" | "accountAgeDays">): string | undefined {
  const days = person.accountAgeDays;
  if (typeof days !== "number" || days < 0) return undefined;
  const where = PLATFORM_LABEL[person.platform] ?? person.platform;
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} on ${where}`;
  if (days < 730) return `${Math.round(days / 30)} months on ${where}`;
  return `${Math.floor(days / 365)} years on ${where}`;
}

/** Their name if the platform gave one, otherwise the handle. Never a fabricated human name. */
export function personDisplayName(person: PublicPerson | undefined, fallbackHandle: string): string {
  return person?.displayName?.trim() || fallbackHandle;
}

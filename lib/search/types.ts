// Shared vocabulary for the lead-search pipeline. The whole point of this module is that every
// stage has an observable boundary: a list of candidates goes in, a smaller list comes out, and
// every item that disappears does so for exactly one named reason. That's what makes a bad run
// diagnosable ("resolution failure or extraction failure?") instead of a guess.

export type Platform = "Reddit" | "Hacker News" | "Forum" | "Slack" | "Discord" | "Newsletter" | "X";

export type IntentTier = "seeking" | "complaining" | "adjacent";

// One reason, one drop. Never drop a candidate without recording which of these applied.
export type DropReason =
  | "stale" // outside the niche's relevance window
  | "too_short" // no quotable evidence in the body
  | "self_promo" // the author is marketing their own thing
  | "bot" // automod / *-bot / template post
  | "aggregator" // roundup, listicle, syndicated feed
  | "keyword_only" // lexicon term present but no first-person problem statement
  | "dupe_author" // we already have a stronger post from this person
  | "no_intent" // model found no real expression of the problem
  | "excerpt_not_verbatim" // model's quote isn't a literal span of the post body
  | "source_timeout" // the venue API didn't answer inside its budget
  | "source_error"; // the venue API errored

export type StageMetric = {
  stage: string;
  candidatesIn: number;
  candidatesOut: number;
  ms: number;
  drops: Partial<Record<DropReason, number>>;
  note?: string;
};

export type RunTrace = {
  runId: string;
  stages: StageMetric[];
  totalMs: number;
};

export type Venue = {
  id: string; // stable key, e.g. "reddit:smallcapinvesting"
  platform: Platform;
  name: string; // display name, e.g. "r/smallcapinvesting"
  url?: string;
  members: number | null; // REAL subscriber count from the platform, or null if genuinely unknown
  membersLabel: string; // human label derived from `members` — never model-invented
  fit: "Strong fit" | "Weak" | "Untested";
  note: string;
  // Slack and Discord messages are private and not searchable from outside. Those venues are
  // still worth surfacing as places to join, but they can never be a source of extracted leads —
  // this flag keeps that distinction honest instead of implied.
  searchable: boolean;
  rank: number;
};

// A raw post pulled from a venue API, before any filtering. Every field here comes from the
// platform itself, not from a model — which is why the required lead fields (author, permalink,
// timestamp, body) are structurally guaranteed rather than promised.
export type Candidate = {
  id: string;
  venueId: string;
  venueName: string;
  /** How to LABEL this on screen. A display string — never an identity key. */
  platform: Platform;
  /**
   * The network this actually came from, as the crawler names it: "hn", "stackexchange",
   * "discourse", "lemmy", "bluesky", "reddit", "quora", "x".
   *
   * Separate from `platform` because `platform` is a display union in which "Forum" means Stack
   * Exchange, Discourse, Lemmy AND Quora, and "X" meant both X and Bluesky. `personFingerprint`
   * hashes platform + handle, so fingerprinting on the display label did two wrong things at once:
   * it merged four unrelated networks under "Forum", and it guaranteed that a person found live
   * ("Hacker News") could never dedupe against the same person found in the corpus ("hn") — pass 1
   * merges those two routes by fingerprint, so every overlap was showing up twice.
   *
   * Optional so a source that has not been updated still compiles; the fingerprint call sites fall
   * back to `platform`, which is the behaviour that existed before this field.
   */
  networkId?: string;
  author: string;
  permalink: string;
  postedAt: Date;
  title: string;
  body: string;
  score: number;
  numComments: number;
};

// A candidate that survived both filter stages and carries model-assigned intent plus a
// verbatim excerpt validated against the real post body.
export type ScoredLead = Candidate & {
  intentTier: IntentTier;
  confidence: number;
  excerpt: string;
  buyerIndex: number;
};

export type LexiconInput = {
  problemPhrases: string[];
  seekingPhrases: string[];
  negativeTerms: string[];
  relevanceWindowDays: number;
};

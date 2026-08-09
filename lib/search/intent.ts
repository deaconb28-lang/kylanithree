// Stage 1 of the intent cascade, plus the taxonomy the whole ranking model rests on.
// See docs/search-architecture.md §3.
//
// This is the highest-leverage component in the system: storage, embedding spend, index size and
// retrieval quality all scale with what survives here. It runs in microseconds with no model call.
//
// Calibrated for RECALL, not precision. A false positive costs one embedding call — fractions of a
// cent. A false negative is a lead nobody will ever see. Target ≥95% recall; precision as low as
// 15% is acceptable at this stage, because two more stages follow.

export const LEXICON_VERSION = 1;

export type IntentType =
  | "switching_away"
  | "seeking_tool"
  | "evaluating_alternatives"
  | "building_workaround"
  | "hiring_for_problem"
  | "describing_pain"
  | "none";

// Not all intent is worth the same. Someone already paying for the category and actively unhappy is
// a different proposition from someone describing a pain they have made peace with.
export const INTENT_WEIGHT: Record<IntentType, number> = {
  switching_away: 1.0, // already paying, actively unhappy — the best lead that exists
  seeking_tool: 0.95, // explicit demand, in-market now
  evaluating_alternatives: 0.9, // in-market, but you're entering a live bake-off
  building_workaround: 0.8, // proven need and proven willingness to invest effort
  hiring_for_problem: 0.7, // real budget, but they chose a person over a product
  describing_pain: 0.55, // real need, no purchase intent yet
  none: 0,
};

export const INTENT_TYPES: IntentType[] = [
  "switching_away",
  "seeking_tool",
  "evaluating_alternatives",
  "building_workaround",
  "hiring_for_problem",
  "describing_pain",
];

// Versioned deliberately: these get tuned weekly early on, and every classification records the
// version it was made under so a precision change can be traced to a lexicon change.
const NEED_MARKERS: RegExp[] = [
  // asking
  /\b(anyone|anybody) (know|used|tried|recommend)/i,
  /\b(looking|searching) for\b/i,
  /\bany (recommendations|suggestions|alternatives|tools)\b/i,
  /\bwhat('s| is| are) the best\b/i,
  /\bhow (do|did|can|would) (i|we|you)\b/i,
  /\bis there (a|an|any)\b.{0,40}\b(tool|app|service|way)\b/i,
  // complaining
  /\b(frustrat|annoy|struggl)\w*\b/i,
  /\b(fed up|sick of|tired of)\b/i,
  /\b(hate|can't stand|cannot stand|nightmare|painful|clunky)\b/i,
  /\bdoesn'?t (work|scale|support)\b/i,
  /\b(waste|wasting) (of )?(time|money|hours)\b/i,
  // evaluating / switching
  /\b(vs\.?|versus|compared to|instead of)\b/i,
  /\b(migrat|switch|mov)\w* (from|off|away from)\b/i,
  /\b(alternative|replacement) (to|for)\b/i,
  /\bcancel(l)?(ed|ing)? (our|my|the)\b/i,
  // workaround — the highest-intent signal there is for a tool
  /\b(i|we) (built|wrote|hacked|made) (a|my own|our own)\b/i,
  /\b(script|spreadsheet|zap|workaround) (to|that) (handle|deal|manage)\b/i,
  // Hiring for the problem. The object comes BETWEEN the verb and the infinitive in real speech
  // — "looking to hire someone to manage X", "need a person who can handle Y" — so requiring them
  // adjacent matched almost nothing.
  /\b(hiring|looking to hire|need to hire|want to hire|need someone|need a person)\b.{0,30}\b(to|who can|for)\b/i,
];

const HARD_REJECT: RegExp[] = [
  // Bounded at 160, not 60. With an 80-character length floor above, a 60-character bound made
  // this pattern unfireable — it was dead. Real pure-gratitude posts run 80-150 characters and
  // routinely contain a need marker ("been struggling with this for months, thank you!"), which is
  // exactly the false positive this is here to catch. Still anchored to the start, so a message
  // that opens with thanks and then states a real need goes on to the next stages rather than
  // being killed here.
  /^(thanks|thank you|thanks so much|congrats|congratulations|nice|great|lol|this)\b.{0,160}$/i,
  /\b(upvote|karma|repost|mod(erator)?s?)\b/i,
  /\bpromo(tion)?al?\b|\bdiscount code\b|\baffiliate\b/i,
  // Supply side, not demand — someone offering, not needing.
  /^\[?(hiring|for hire|showcase|show hn:)/i,
];

export type GateResult = {
  passed: boolean;
  /** Which marker fired, for tuning. Null when rejected. */
  matched: string | null;
  reason: "need_marker" | "no_need_marker" | "hard_reject" | "too_short";
  lexiconVersion: number;
};

/** Minimum length worth classifying. There is no extractable intent in "same here" or "+1". */
export const MIN_BODY_CHARS = 80;

export function lexicalGate(text: string): GateResult {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < MIN_BODY_CHARS) {
    return { passed: false, matched: null, reason: "too_short", lexiconVersion: LEXICON_VERSION };
  }
  // Hard rejects win over need markers: "thanks, this is exactly what I was looking for" contains
  // a need marker but is gratitude, not demand.
  for (const re of HARD_REJECT) {
    if (re.test(trimmed)) {
      return { passed: false, matched: re.source, reason: "hard_reject", lexiconVersion: LEXICON_VERSION };
    }
  }
  for (const re of NEED_MARKERS) {
    if (re.test(trimmed)) {
      return { passed: true, matched: re.source, reason: "need_marker", lexiconVersion: LEXICON_VERSION };
    }
  }
  return { passed: false, matched: null, reason: "no_need_marker", lexiconVersion: LEXICON_VERSION };
}

/**
 * Cheap pre-classifier normalisation, run before the gate. Removes the 30-50% of raw volume that
 * costs nothing to identify: quoted replies, signatures, and boilerplate that would otherwise
 * trip a need marker belonging to somebody else's words.
 */
export function normalizeForIntent(raw: string): string {
  return (raw ?? "")
    .normalize("NFKC")
    // Quoted text is the previous author speaking, not this one. A need marker inside a quote is
    // the single most common false positive there is.
    .replace(/^\s*>.*$/gm, " ")
    .replace(/```[\s\S]*?```/g, " ")
    // Signature blocks.
    .replace(/^\s*--\s*$[\s\S]*/m, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Spam floor. A brand-new account with almost no history is not a person worth writing to, however
 * well their post scores.
 */
export function passesSpamFloor(author: { accountAgeDays?: number | null; postCount?: number | null }): boolean {
  const age = author.accountAgeDays;
  const posts = author.postCount;
  // Unknown history is not disqualifying — most sources don't expose it, and treating absence as
  // failure would silently drop every candidate from those platforms.
  if (age == null && posts == null) return true;
  if (age != null && age < 7 && (posts ?? 0) < 3) return false;
  return true;
}

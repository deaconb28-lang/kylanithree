// Excerpt verification, kept pure and dependency-free so the anti-fabrication guarantee can be
// unit-tested without an API key.
//
// The invariant this module exists to enforce: text shipped to a founder as a quote is ALWAYS a
// literal span of the real post. Not "probably", not "the model promised" — checked.

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Whitespace-normalized only. Never case-folded, never punctuation-stripped: those are the
// person's actual words, and loosening the comparison would defeat the point of having it.
export function isVerbatim(excerpt: string, body: string): boolean {
  const e = normalize(excerpt);
  if (e.length < 15) return false;
  return normalize(body).includes(e);
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? []);
}

// When the model paraphrases, tidies markdown, or stitches two sentences together, the quote fails
// the verbatim test — but the PERSON is still real and still has the problem. Discarding them over
// quote formatting threw away genuine leads, so instead find the real sentence in the body that
// best overlaps what the model chose and ship that. The result is still a literal span of the
// post, so the guarantee holds; only a candidate with no usable sentence is dropped.
export function salvageExcerpt(attempted: string, body: string): string | null {
  const sentences = normalize(body)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 300);
  if (sentences.length === 0) return null;

  const target = words(attempted);
  if (target.size === 0) return null;

  let best: { text: string; score: number } | null = null;
  for (const s of sentences) {
    const sw = words(s);
    let shared = 0;
    for (const w of target) if (sw.has(w)) shared++;
    const score = shared / target.size;
    if (!best || score > best.score) best = { text: s, score };
  }
  // Needs real overlap — otherwise we would be quoting an unrelated sentence just to have one.
  return best && best.score >= 0.4 ? best.text : null;
}

// The single entry point callers should use: returns text guaranteed to appear in `body`, or null.
export function resolveExcerpt(attempted: string, body: string): string | null {
  if (isVerbatim(attempted, body)) return normalize(attempted);
  return salvageExcerpt(attempted, body);
}

// --- relevance-selected excerpts ----------------------------------------------------------------
//
// Which part of a post a founder is shown.
//
// The first ~240 characters used to be it, which is the wrong 240 characters most of the time: a
// forum post opens with context and greetings and reaches the problem in the third sentence. A
// lead whose excerpt is "Hi all, first time posting here, apologies if this is the wrong place"
// gives a founder no way to tell whether the person is worth writing to.
//
// So the excerpt is chosen by overlap with the founder's own inferred vocabulary — the same
// keywords the search ran on. What they read is the part of the post that is about their product.
//
// It stays a LITERAL SPAN of the real post. Not a generated summary, deliberately: a summary would
// break the invariant this whole module exists to enforce (everything quoted is checkably the
// person's own words), add a model call inside pass 1's 8-second budget, and introduce exactly the
// fabrication risk the product's first design principle forbids. Picking the right real sentences
// gets the same benefit with none of that.

/** Words too common to be evidence of anything. Kept tiny — this is a tie-breaker, not a stoplist. */
const IGNORED = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "our", "are", "was", "have", "has",
  "not", "but", "all", "any", "can", "how", "why", "what", "when", "who", "from", "they", "them",
  "its", "it's", "get", "got", "just", "like", "some", "more", "than", "then", "into", "out",
]);

function terms(list: string[]): Set<string> {
  const out = new Set<string>();
  for (const phrase of list) {
    for (const w of phrase.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
      if (w.length >= 3 && !IGNORED.has(w)) out.add(w);
    }
  }
  return out;
}

function splitSentences(body: string): string[] {
  return normalize(body)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The span of `body` most about `keywords`, capped at `maxChars`.
 *
 * Scores each sentence by how many of the founder's terms it contains, then grows a window around
 * the best one so the quote reads as speech rather than as a clipped fragment. Falls back to the
 * opening of the post when nothing matches — an honest "here is what they said" beats an empty
 * card, and `matchedFor` on the lead already tells the founder whether anything matched at all.
 */
export function relevantExcerpt(body: string, keywords: string[], maxChars = 260): string {
  const clean = normalize(body);
  if (clean.length <= maxChars) return clean;

  const sentences = splitSentences(clean);
  if (sentences.length === 0) return clean.slice(0, maxChars).trimEnd() + "…";

  const wanted = terms(keywords);
  if (wanted.size === 0) return trimTo(clean, maxChars);

  const scores = sentences.map((s) => {
    const sw = new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? []);
    let hits = 0;
    for (const w of wanted) if (sw.has(w)) hits += 1;
    // Per-sentence density, so one long rambling sentence does not out-score a precise short one
    // purely by containing more words.
    return hits === 0 ? 0 : hits + hits / Math.sqrt(sw.size || 1);
  });

  let bestAt = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bestAt]) bestAt = i;
  if (scores[bestAt] === 0) return trimTo(clean, maxChars);

  // Grow outward from the best sentence while there is room, preferring the sentence after — a
  // problem statement is usually followed by its consequence, which is the part worth reading.
  let start = bestAt;
  let end = bestAt;
  let length = sentences[bestAt].length;
  for (;;) {
    const next = end + 1 < sentences.length ? sentences[end + 1] : null;
    const prev = start - 1 >= 0 ? sentences[start - 1] : null;
    if (next && length + next.length + 1 <= maxChars) {
      end += 1;
      length += next.length + 1;
      continue;
    }
    if (prev && length + prev.length + 1 <= maxChars) {
      start -= 1;
      length += prev.length + 1;
      continue;
    }
    break;
  }

  const span = sentences.slice(start, end + 1).join(" ");
  // Leading ellipsis only when the quote genuinely starts mid-post, so a founder can tell at a
  // glance whether they are reading the opening or something from further down.
  const prefix = start > 0 ? "…" : "";
  const suffix = end < sentences.length - 1 ? "…" : "";
  return `${prefix}${trimTo(span, maxChars)}${suffix}`;
}

function trimTo(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/**
 * Which of the founder's terms this text actually contains.
 *
 * `matchedFor` used to be `keywords.filter(k => text.includes(k))` — a whole-phrase substring test
 * against inferred keywords that are long phrases ("scattered feature requests everywhere"). Those
 * never appear verbatim in a real post, so in production every lead shipped with an EMPTY
 * matchedFor: the card could not say why the person was there, which is the one thing a founder
 * needs to trust it.
 *
 * Matching on the significant words instead means the answer is the terms that genuinely appear.
 * Returned as the original phrases, since that is the founder's own vocabulary and what the UI
 * should show back to them.
 */
export function matchedTerms(text: string, keywords: string[]): string[] {
  const present = new Set(text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  const out: string[] = [];
  for (const phrase of keywords) {
    const significant = (phrase.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
      (w) => w.length >= 3 && !IGNORED.has(w),
    );
    if (significant.length === 0) continue;
    const hits = significant.filter((w) => present.has(w)).length;
    // Half the phrase's significant words, so "scattered feature requests everywhere" needs a real
    // overlap rather than the single word "requests" appearing anywhere in a long post.
    if (hits / significant.length >= 0.5) out.push(phrase);
  }
  return out;
}

/**
 * How strongly a document speaks the founder's vocabulary, 0..1.
 *
 * Used as a floor rather than a ranking signal. Atlas `$search` with `minimumShouldMatch: 1` will
 * happily return a document that matched exactly one common word — which is how a post about
 * verifying a Bitcoin node surfaced for an issue tracker, the same generic-vocabulary failure that
 * once routed software products to the Pets Stack Exchange.
 */
export function vocabularyOverlap(text: string, keywords: string[]): number {
  const wanted = terms(keywords);
  if (wanted.size === 0) return 1;
  const present = new Set(text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  let hits = 0;
  for (const w of wanted) if (present.has(w)) hits += 1;
  return hits / wanted.size;
}

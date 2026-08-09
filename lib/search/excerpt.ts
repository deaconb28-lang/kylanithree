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
    // How much of the phrase has to be present, and it depends on how long the phrase is.
    //
    // A flat 50% is wrong for short phrases: "linear alternative" is two significant words, so one
    // of them sufficed — and "alternative" alone matched posts about git hosting, Cisco Packet
    // Tracer and OctoPrint, all of them labelled as wanting a Linear alternative. A two-word phrase
    // carries no redundancy, so both words must appear. Longer phrases keep the looser rule,
    // because "scattered feature requests everywhere" should still match someone who wrote three of
    // those four words, but never on one.
    const needed = significant.length <= 2 ? significant.length : Math.max(2, Math.ceil(significant.length * 0.5));
    if (hits >= needed) out.push(phrase);
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

/**
 * One line saying what a lead is about, so a founder knows before reading the quote.
 *
 * This is a SUMMARY and must never be rendered as a quotation. The classifier's `problemStatement`
 * is a neutral third-person restatement — "needs a project management tool to replace Microsoft
 * Project" — and it was previously being shown inside quote marks on the card, attributing to a
 * real person a sentence they never wrote. Summary and quote are different claims and the UI now
 * keeps them apart: this on top in plain text, the verbatim span below in the blockquote.
 *
 * When there is no classifier statement (an unclassified document, or a live-shallow lead), the
 * single most relevant sentence of the post stands in. That is still the person's own words, which
 * is a weaker summary but never a wrong one.
 */
export function leadSummary(opts: {
  /** The classifier's restatement, when the document has one. */
  problemStatement?: string;
  body: string;
  keywords: string[];
  maxChars?: number;
}): string | undefined {
  const { problemStatement, body, keywords, maxChars = 150 } = opts;

  const stated = normalize(problemStatement ?? "");
  if (stated.length >= 15) return trimTo(stated, maxChars);

  // Fall back to the best-matching single sentence — deliberately one, not a window: the job here
  // is "what is this about", and two sentences is already the quote's job.
  const sentences = splitSentences(body).filter((s) => s.length >= 25);
  if (sentences.length === 0) return undefined;

  const wanted = terms(keywords);
  if (wanted.size === 0) return trimTo(sentences[0], maxChars);

  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const sw = new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? []);
    let hits = 0;
    for (const w of wanted) if (sw.has(w)) hits += 1;
    const score = hits === 0 ? 0 : hits + hits / Math.sqrt(sw.size || 1);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0 ? trimTo(best, maxChars) : undefined;
}

/**
 * Where in `text` the founder's matched phrases actually appear, as [start, end) ranges.
 *
 * This exists so the card can mark the match inside the quote instead of restating it underneath.
 * Every lead card used to carry a `matched "can't find first customers"` chip on its own row, and
 * with fourteen leads that was the same sentence fourteen times — a whole horizontal band per card
 * spent repeating what the summary above it already implied. Showing WHERE the match is says
 * strictly more in strictly less space.
 *
 * Built on the SAME tokenizer and stop-word set `matchedTerms` uses, deliberately. If the highlight
 * used its own word rules the two would disagree at the edges, and the failure would be the worst
 * kind: a card claiming a phrase matched with nothing marked in the text, or — worse — a mark on a
 * word that did not actually count toward the match. Sharing the rule makes them agree by
 * construction rather than by coincidence.
 *
 * Ranges come back sorted and merged, so overlapping hits from two phrases sharing a word ("first
 * customers" and "where do I find early customers") render as one continuous mark rather than two
 * abutting elements with a seam between them.
 */
export function highlightRanges(text: string, matchedPhrases: string[]): [number, number][] {
  if (!text || matchedPhrases.length === 0) return [];

  // The significant words of every matched phrase, by the same standard matchedTerms applies:
  // three characters or more, and not a stop word.
  const wanted = new Set<string>();
  for (const phrase of matchedPhrases) {
    for (const word of phrase.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
      if (word.length >= 3 && !IGNORED.has(word)) wanted.add(word);
    }
  }
  if (wanted.size === 0) return [];

  // Walk the text's own tokens so the ranges are real offsets into the original string — indexOf on
  // each keyword would find substrings inside longer words and mark the "cat" in "scattered", which
  // is precisely the bug that once routed software products to the Pets Stack Exchange.
  const found: [number, number][] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9']+/g)) {
    const word = m[0];
    if (m.index === undefined) continue;
    // The SAME inflection tolerance `lib/search/seSites.ts` applies when routing a keyword to a
    // site: `\b<keyword>(?:s|es|ing|ed)?\b`. Suffixes are allowed ON the keyword, which means
    // "customer" marks "customers" but "customers" does not mark "customer" — asymmetric, and
    // deliberately so, because that is exactly the rule the rest of the product matches by. A
    // looser stemmer here would mark words that never counted toward the match.
    // Each suffix stripped INDEPENDENTLY, not through one alternation. `(es|ed|ing|s)$` looks
    // equivalent and is not: it strips "es" from "struggles" before it ever tries "s", yielding
    // "struggl" and losing a match the router would have made. The keyword can be the token with
    // any ONE of those endings removed, so every candidate has to be tested on its own.
    const candidates = [word, word.replace(/s$/, ""), word.replace(/es$/, ""), word.replace(/ed$/, ""), word.replace(/ing$/, "")];
    if (candidates.some((c) => c.length >= 3 && wanted.has(c))) {
      found.push([m.index, m.index + word.length]);
    }
  }
  if (found.length === 0) return [];

  // Merge into continuous regions, bridging the small words that sit BETWEEN matched ones.
  //
  // Merging only on adjacency looked wrong the moment it was rendered: "First Ten Customers" came
  // out as two marks with an unmarked "Ten" in the hole, and "cold outreach not working" as three.
  // The founder's phrase is the unit they care about, so it should read as one region rather than
  // as a row of separate stabs.
  //
  // Bridged only across a SHORT gap with no sentence punctuation in it. The punctuation test is
  // what stops a mark running from one sentence into the next and swallowing everything between
  // two distant hits — a gap containing "." or "," is a different thought, however short it is.
  const BRIDGE_MAX = 10;
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [found[0]];
  for (const [start, end] of found.slice(1)) {
    const last = merged[merged.length - 1];
    const gap = text.slice(last[1], start);
    if (start <= last[1] || (gap.length <= BRIDGE_MAX && !/[.,;:!?\n]/.test(gap))) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** `text` split into alternating plain and highlighted segments, ready to render. */
export function highlightSegments(
  text: string,
  matchedPhrases: string[],
): { text: string; marked: boolean }[] {
  const ranges = highlightRanges(text, matchedPhrases);
  if (ranges.length === 0) return [{ text, marked: false }];

  const out: { text: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) out.push({ text: text.slice(cursor, start), marked: false });
    out.push({ text: text.slice(start, end), marked: true });
    cursor = end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), marked: false });
  return out;
}

/**
 * One plain sentence a founder can read at a glance.
 *
 * `leadSummary` returns the classifier's `problemStatement` trimmed to 150 characters, and that is
 * the right input for the embedding — a rich, specific, neutral restatement is exactly what closes
 * the vocabulary gap between how people complain and how founders describe a product. It is the
 * wrong output for a card. At 150 characters it runs to two or three lines, carries the classifier's
 * register ("The author requires a mechanism whereby…"), and a founder scanning fourteen of them
 * reads none of them.
 *
 * So this is a RENDER-TIME transform rather than a change to what the classifier emits. Two things
 * follow from that, and both are why it is built this way:
 *
 *   · Retrieval quality is untouched. The embedded statement stays exactly as rich as it was.
 *   · It applies retroactively to every document already classified, with no reclassification and
 *     no cost — tens of thousands of rows, fixed by a function.
 *
 * The cap is a CLAUSE boundary, never a mid-sentence ellipsis. "Needs a replacement for a
 * discontinued tracking plugin now that GA4's engagement metrics fall…" is worse than no summary:
 * a sentence cut off mid-thought reads as a bug, where the same sentence cut at "now that" reads as
 * a complete, shorter thought.
 */
const SUMMARY_PREFIXES =
  /^(?:the\s+)?(?:author|user|poster|person|op|they|developer|team)\s+(?:is\s+|are\s+|has\s+|have\s+)?(?:currently\s+)?/i;

/** Clause joiners worth cutting at — each one starts a qualifier the first half survives without. */
const CLAUSE_BREAKS = [
  " now that ",
  " instead of ",
  " so that ",
  " because ",
  " after ",
  " while ",
  " rather than ",
  " in order to ",
  " which ",
  ", and ",
  ", but ",
  ", ",
  " — ",
  "; ",
];

export function laymanSummary(summary: string | undefined | null, maxChars = 92): string | undefined {
  if (!summary) return undefined;
  let s = normalize(summary);
  if (!s) return undefined;

  // One sentence. `splitSentences` already knows how to do this without breaking on "e.g." and the
  // like, so the rule is shared rather than re-guessed here.
  s = splitSentences(s)[0] ?? s;

  // Drop the classifier talking about the author in the third person. The card already shows whose
  // words these are, immediately below — "The author needs" spends four words saying nothing.
  s = s.replace(SUMMARY_PREFIXES, "").trim();
  if (s.length < 12) return undefined;

  if (s.length > maxChars) {
    // Cut at the LAST clause boundary that still fits. Deliberately last rather than first: the goal
    // is the longest complete thought under the cap, not the shortest one.
    let cut = -1;
    for (const brk of CLAUSE_BREAKS) {
      const at = s.toLowerCase().lastIndexOf(brk, maxChars);
      if (at > 24 && at > cut) cut = at;
    }
    if (cut > 0) {
      s = s.slice(0, cut);
    } else {
      // No clause boundary, so fall back to a WORD boundary and mark the truncation. `trimTo` is
      // not reused here: it cuts at an exact character index (mid-word is fine for a quote, where
      // the reader can see it is an excerpt) and appends the ellipsis AFTER the cap, so the result
      // is maxChars + 1. A summary that overruns its own cap by one is the kind of thing that only
      // shows up as a wrapped line on one card in twenty.
      const room = maxChars - 1;
      const space = s.lastIndexOf(" ", room);
      s = `${s.slice(0, space > 24 ? space : room).trimEnd()}\u2026`;
    }
  }

  s = s.replace(/[\s,;:—-]+$/, "");
  if (s.length < 12) return undefined;
  // Sentence case, and no full stop: these are labels on a card, not prose. A question mark is kept
  // because it changes the meaning.
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.replace(/\.$/, "");
}

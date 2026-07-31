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

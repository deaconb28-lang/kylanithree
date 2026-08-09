// Turning a founder's problem language into queries a search engine will actually match.
//
// This exists because of a mismatch that quietly returned nothing: the lexicon holds natural
// phrases ("need a stock picking newsletter"), but Reddit, Lemmy, Stack Exchange and Algolia are
// keyword engines, not semantic ones. Handing them a six-word sentence matches almost no documents
// — the phrases read well and retrieved nothing.
//
// So phrases become short keyword queries. Two or three distinctive words is the sweet spot: wide
// enough to return a real corpus, narrow enough that the corpus is on-topic. Judging whether any
// given result is actually a buyer is not this file's job — that belongs to the model qualifier,
// which reads the post.

const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "and", "or", "in", "on", "with", "my", "our", "your", "is",
  "are", "it", "that", "this", "how", "do", "does", "what", "best", "good", "great", "any", "some",
  "get", "getting", "need", "needs", "want", "wants", "looking", "look", "help", "please", "someone",
  "anyone", "really", "very", "just", "much", "more", "most", "own", "using", "use", "make", "makes",
  "way", "ways", "thing", "things", "stuff", "new", "old", "other", "than", "then", "from", "at",
  "every", "always", "still", "keep", "keeps", "tired", "sick", "lot", "bit", "kind", "sort",
  "by", "as", "be", "been", "have", "has", "had", "can", "could", "would", "should", "i", "we", "you",
]);

export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9'-]+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// One phrase in, one short query out.
//
// Keeps the LEADING content words, because English puts the domain noun first in this kind of
// phrase: "stock picking newsletter recommendations" is about stocks, and trailing-word selection
// produced "picking newsletter recommendations", which drops the one term that made the query
// specific. Two words is the sweet spot for keyword engines — enough to be on-topic, loose enough
// to return a real corpus.
export function toSearchQuery(phrase: string, maxWords = 2): string {
  const words = contentWords(phrase);
  if (words.length === 0) return phrase.trim();
  return words.slice(0, maxWords).join(" ");
}

// Deduplicates because different phrases frequently collapse to the same keywords once filler is
// stripped — searching the identical query three times is wasted budget, not extra coverage.
export function toSearchQueries(phrases: string[], maxWords = 2): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const q = toSearchQuery(p, maxWords);
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

// How strongly a post's text overlaps the niche vocabulary, 0-1.
//
// Deliberately a RANKING signal rather than a gate. An earlier build dropped anything scoring below
// a threshold, which meant a keyword heuristic got to overrule the model on relevance — and it was
// wrong often enough to empty out whole runs. Now weak overlap simply sorts lower, and the
// qualifier decides.
export function topicalOverlap(text: string, phrases: string[]): number {
  const postWords = new Set(contentWords(text));
  if (postWords.size === 0) return 0;
  let best = 0;
  for (const phrase of phrases) {
    const terms = contentWords(phrase);
    if (terms.length === 0) continue;
    const hits = terms.filter((t) => postWords.has(t)).length;
    best = Math.max(best, hits / terms.length);
  }
  return best;
}

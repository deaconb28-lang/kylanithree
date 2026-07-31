import type { Candidate, DropReason, LexiconInput } from "./types";

// Stage 3 — the cheap pass. Pure functions, no model, no network: this is where the bulk of the
// noise dies for free, so the expensive scoring pass only ever sees plausible candidates. Every
// rejection returns a named reason so a thin run can be read off the trace instead of guessed at.

const BOT_AUTHORS = new Set(["AutoModerator", "[deleted]", "RemindMeBot", "sneakpeekbot", "VisualMod", "savevideo"]);

const AGGREGATOR_HOSTS = [
  "medium.com",
  "substack.com",
  "linktr.ee",
  "producthunt.com",
  "betalist.com",
  "indiehackers.com/product",
  "youtube.com",
  "youtu.be",
  "bit.ly",
  "amzn.to",
];

// Phrases that mark a post as the author selling something rather than having a problem. Kept
// deliberately tight: "I built X to solve Y" is a founder promoting, but "I built a spreadsheet
// and it's falling over" is a real complaint, so promo detection also requires an outbound
// commercial link before it fires (see isSelfPromo).
const PROMO_MARKERS = [
  "check out my",
  "i built",
  "i made",
  "we built",
  "we launched",
  "just launched",
  "my startup",
  "our product",
  "sign up at",
  "free trial",
  "discount code",
  "promo code",
  "dm me for",
  "link in bio",
  "affiliate",
];

// A first-person problem statement looks like someone talking about their own situation. Without
// one of these, a lexicon hit is just the topic being mentioned — which is exactly the
// "matched a keyword, showed no intent" failure this stage exists to stop.
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|my|we|we're|were|our|us)\b/i;
const QUESTION_OR_STRUGGLE =
  /(\?|how do (you|i)|anyone else|any (advice|recommendations|suggestions)|struggling|frustrat|tired of|sick of|can't find|cant find|looking for|need (a|some|help)|worth it|alternative to|instead of|problem with|issue with|help)/i;

export type FilterResult = {
  kept: Candidate[];
  drops: Partial<Record<DropReason, number>>;
  droppedIds: { id: string; reason: DropReason }[];
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSelfPromo(c: Candidate): boolean {
  const text = `${c.title}\n${c.body}`.toLowerCase();
  const hasPromoLanguage = PROMO_MARKERS.some((m) => text.includes(m));
  if (!hasPromoLanguage) return false;
  // Promo language alone isn't enough — pair it with an outbound link to something commercial,
  // which is what separates a founder plugging their tool from a user describing what they tried.
  const links = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  return links.some((l) => {
    const h = hostOf(l);
    return h && !h.endsWith("reddit.com") && !h.endsWith("redd.it");
  });
}

function isAggregator(c: Candidate): boolean {
  const links = `${c.title}\n${c.body}`.match(/https?:\/\/[^\s)]+/g) ?? [];
  return links.some((l) => AGGREGATOR_HOSTS.some((h) => hostOf(l).includes(h)));
}

const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "and", "or", "in", "on", "with", "my", "our", "your", "is", "are", "it",
  "that", "this", "how", "do", "does", "what", "best", "good", "any", "some", "get", "need", "want", "you", "we",
]);

// Crude suffix stripping, applied to both sides of every comparison, so "picks"/"picking"/"picked"
// collapse together. Not linguistically correct — it only has to be consistent.
function stem(token: string): string {
  return token.replace(/(ings|ing|ers|er|ed|es|s)$/, "");
}

function contentTokens(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return raw.filter((t) => t.length > 2 && !STOPWORDS.has(t)).map(stem);
}

// Fraction of a phrase's meaningful words that appear anywhere in the post.
//
// Emphatically NOT an exact substring test. Reddit and HN search are tokenized and fuzzy, so a
// post surfaced by the query "stock picking newsletter" very often reads "anyone know a good
// newsletter for picks?" — no literal substring, obviously the same person. Requiring the exact
// phrase silently discarded almost every real candidate and was the main reason runs came back
// empty.
function phraseCoverage(phrase: string, postTokens: Set<string>): number {
  const tokens = contentTokens(phrase);
  if (tokens.length === 0) return 0;
  return tokens.filter((t) => postTokens.has(t)).length / tokens.length;
}

// Meaning-level gate. A candidate must both touch the niche's vocabulary AND read as someone
// speaking about their own situation. One without the other is noise.
function isKeywordOnly(c: Candidate, lexicon: LexiconInput): boolean {
  const text = `${c.title}\n${c.body}`;
  const postTokens = new Set(contentTokens(text));
  const phrases = [...lexicon.problemPhrases, ...lexicon.seekingPhrases].filter(Boolean);
  // Half the meaningful words of any one phrase is enough to say the post is on-topic; the
  // first-person and struggle tests below are what actually establish intent.
  const onTopic = phrases.some((p) => phraseCoverage(p, postTokens) >= 0.5);
  if (!onTopic) return true;
  return !(FIRST_PERSON.test(text) && QUESTION_OR_STRUGGLE.test(text));
}

function hasNegativeTerm(c: Candidate, lexicon: LexiconInput): boolean {
  const lower = `${c.title}\n${c.body}`.toLowerCase();
  return lexicon.negativeTerms.some((t) => t && lower.includes(t.toLowerCase()));
}

// Cheap prior used to rank survivors before the expensive pass, and to decide which post wins when
// one author appears twice. Recency dominates, engagement breaks ties — an old highly-upvoted
// thread is worth less to a founder than a fresh one with a couple of replies.
export function signalScore(c: Candidate, windowDays: number): number {
  const ageDays = (Date.now() - c.postedAt.getTime()) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / Math.max(windowDays, 1));
  const engagement = Math.log10(1 + c.score + c.numComments * 2) / 3;
  return recency * 0.7 + Math.min(engagement, 1) * 0.3;
}

export function cheapFilter(candidates: Candidate[], lexicon: LexiconInput): FilterResult {
  const drops: Partial<Record<DropReason, number>> = {};
  const droppedIds: { id: string; reason: DropReason }[] = [];
  const drop = (c: Candidate, reason: DropReason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    droppedIds.push({ id: c.id, reason });
  };

  const cutoff = Date.now() - lexicon.relevanceWindowDays * 86_400_000;
  const survivors: Candidate[] = [];

  for (const c of candidates) {
    if (!c.postedAt || Number.isNaN(c.postedAt.getTime()) || c.postedAt.getTime() < cutoff) {
      drop(c, "stale");
      continue;
    }
    if (BOT_AUTHORS.has(c.author) || /(-|_)?bot$/i.test(c.author)) {
      drop(c, "bot");
      continue;
    }
    // Low enough to keep a terse but real complaint ("spreadsheet keeps breaking, any ideas?") and
    // most HN comments, which are frequently short. 80 was cutting real leads.
    if (`${c.title} ${c.body}`.trim().length < 45) {
      drop(c, "too_short");
      continue;
    }
    if (isAggregator(c)) {
      drop(c, "aggregator");
      continue;
    }
    if (isSelfPromo(c) || hasNegativeTerm(c, lexicon)) {
      drop(c, "self_promo");
      continue;
    }
    if (isKeywordOnly(c, lexicon)) {
      drop(c, "keyword_only");
      continue;
    }
    survivors.push(c);
  }

  // Dedupe by author — one person is one lead, no matter how many venues or phrases surfaced them.
  const byAuthor = new Map<string, Candidate>();
  for (const c of survivors) {
    const key = c.author.toLowerCase();
    const existing = byAuthor.get(key);
    if (!existing) {
      byAuthor.set(key, c);
      continue;
    }
    if (signalScore(c, lexicon.relevanceWindowDays) > signalScore(existing, lexicon.relevanceWindowDays)) {
      byAuthor.set(key, c);
      drop(existing, "dupe_author");
    } else {
      drop(c, "dupe_author");
    }
  }

  const kept = [...byAuthor.values()].sort(
    (a, b) => signalScore(b, lexicon.relevanceWindowDays) - signalScore(a, lexicon.relevanceWindowDays),
  );

  return { kept, drops, droppedIds };
}

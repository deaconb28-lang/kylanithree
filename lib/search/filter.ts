import { topicalOverlap } from "./queries";
import type { Candidate, DropReason, LexiconInput } from "./types";

// Stage 3 — the cheap pass. Pure functions, no model, no network.
//
// Its job is narrow on purpose: remove things that are NOT PEOPLE WITH A PROBLEM — bots, vendors,
// aggregators, stale posts, duplicates. It deliberately does not judge whether a post is relevant
// or shows intent, because a model qualifier reads every survivor and does exactly that. Running
// two meaning gates in series, with the crude one first, meant a keyword heuristic could overrule
// the model and silently empty a run. Relevance now informs ranking instead of gating.
//
// Every rejection returns a named reason so a thin run can be read off the trace, not guessed at.

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

function hasNegativeTerm(c: Candidate, lexicon: LexiconInput): boolean {
  const lower = `${c.title}\n${c.body}`.toLowerCase();
  return lexicon.negativeTerms.some((t) => t && lower.includes(t.toLowerCase()));
}

// Cheap prior deciding which survivors reach the expensive pass, and which post wins when one
// author appears twice. Topical fit is a weight here rather than a filter — a loosely-matching post
// sorts lower, but still gets read by the qualifier if there is room.
export function signalScore(c: Candidate, windowDays: number, phrases: string[] = []): number {
  const ageDays = (Date.now() - c.postedAt.getTime()) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / Math.max(windowDays, 1));
  const engagement = Math.min(1, Math.log10(1 + c.score + c.numComments * 2) / 3);
  const topical = phrases.length ? topicalOverlap(`${c.title} ${c.body}`, phrases) : 0;
  return recency * 0.45 + engagement * 0.2 + topical * 0.35;
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
    survivors.push(c);
  }

  const phrases = [...lexicon.seekingPhrases, ...lexicon.problemPhrases].filter(Boolean);

  // Dedupe by author — one person is one lead, no matter how many venues or phrases surfaced them.
  const byAuthor = new Map<string, Candidate>();
  for (const c of survivors) {
    const key = c.author.toLowerCase();
    const existing = byAuthor.get(key);
    if (!existing) {
      byAuthor.set(key, c);
      continue;
    }
    if (signalScore(c, lexicon.relevanceWindowDays, phrases) > signalScore(existing, lexicon.relevanceWindowDays, phrases)) {
      byAuthor.set(key, c);
      drop(existing, "dupe_author");
    } else {
      drop(c, "dupe_author");
    }
  }

  const kept = [...byAuthor.values()].sort(
    (a, b) => signalScore(b, lexicon.relevanceWindowDays, phrases) - signalScore(a, lexicon.relevanceWindowDays, phrases),
  );

  return { kept, drops, droppedIds };
}

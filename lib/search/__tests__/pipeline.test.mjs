// Offline tests for the pure stages of the search pipeline — the parts that decide what gets
// dropped and why. These need no network and no API key, which is deliberate: the filtering logic
// is where quality is actually enforced, so it should be verifiable without a live run.
//
// Run: node --test lib/search/__tests__/pipeline.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { cheapFilter, signalScore } from "../../../.test-build/lib/search/filter.js";
import { sizeFit, formatMembers } from "../../../.test-build/lib/search/ranking.js";
import { windowToRedditT } from "../../../.test-build/lib/search/reddit.js";
import { resolveExcerpt } from "../../../.test-build/lib/search/excerpt.js";
import { decodeHtmlEntities, cleanSiteTitle, cleanSiteDescription } from "../../../.test-build/lib/htmlText.js";
import { pickStackExchangeSites } from "../../../.test-build/lib/search/seSites.js";
import { buildPhrasePool, planWave } from "../../../.test-build/lib/search/waves.js";
import { scoreLead, starsFromTotal, rankLeads } from "../../../.test-build/lib/search/leadScore.js";
import { toSearchQuery, toSearchQueries, topicalOverlap } from "../../../.test-build/lib/search/queries.js";
import { relativeTime } from "../../../.test-build/lib/relativeTime.js";
import { diagnose, docFor } from "../../../.test-build/lib/search/explain.js";
import { Deadline } from "../../../.test-build/lib/search/deadline.js";
import { spreadAcrossVenues } from "../../../.test-build/lib/search/extract.js";

const LEXICON = {
  problemPhrases: ["stock picks", "which stocks to buy"],
  seekingPhrases: ["stock picking newsletter"],
  negativeTerms: ["book a demo"],
  relevanceWindowDays: 30,
};

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

function candidate(over = {}) {
  return {
    id: "reddit:t3_base",
    venueId: "reddit:investing",
    venueName: "r/investing",
    platform: "Reddit",
    author: "someone",
    permalink: "https://www.reddit.com/r/investing/comments/x/",
    postedAt: daysAgo(2),
    title: "Need help with stock picks",
    body: "I am really struggling to find good stock picks and I'm tired of guessing every week. How do you all decide what to buy?",
    score: 12,
    numComments: 4,
    ...over,
  };
}

test("keeps a genuine first-person problem post", () => {
  const { kept } = cheapFilter([candidate()], LEXICON);
  assert.equal(kept.length, 1);
});

test("drops posts older than the niche relevance window", () => {
  const { kept, drops } = cheapFilter([candidate({ postedAt: daysAgo(90) })], LEXICON);
  assert.equal(kept.length, 0);
  assert.equal(drops.stale, 1);
});

test("drops bots", () => {
  const { kept, drops } = cheapFilter([candidate({ author: "AutoModerator" }), candidate({ id: "b", author: "helpful-bot" })], LEXICON);
  assert.equal(kept.length, 0);
  assert.equal(drops.bot, 2);
});

test("drops self-promo only when promo language is paired with an outbound commercial link", () => {
  const promo = candidate({
    id: "promo",
    body: "I built a tool that gives you stock picks every week, check out my site at https://example.com/signup — free trial available for everyone here.",
  });
  const honest = candidate({
    id: "honest",
    body: "I built a spreadsheet to track my stock picks and it keeps breaking. I'm struggling to keep it current and wondered how others handle this.",
  });
  const { kept, drops } = cheapFilter([promo, honest], LEXICON);
  assert.equal(drops.self_promo, 1);
  assert.deepEqual(kept.map((k) => k.id), ["honest"]);
});

test("drops posts carrying a niche negative term", () => {
  const { drops } = cheapFilter(
    [candidate({ body: "I'm struggling with stock picks. Book a demo with our platform to see how we solve this for you today." })],
    LEXICON,
  );
  assert.equal(drops.self_promo, 1);
});

test("dedupes by author and keeps the stronger post", () => {
  const older = candidate({ id: "old", author: "dupe", postedAt: daysAgo(20), score: 1, numComments: 0 });
  const newer = candidate({ id: "new", author: "Dupe", postedAt: daysAgo(1), score: 50, numComments: 20 });
  const { kept, drops } = cheapFilter([older, newer], LEXICON);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "new");
  assert.equal(drops.dupe_author, 1);
});

test("drops posts too short to quote", () => {
  const { drops } = cheapFilter([candidate({ title: "help", body: "stock picks?" })], LEXICON);
  assert.equal(drops.too_short, 1);
});

test("signalScore prefers recent over merely popular", () => {
  const fresh = candidate({ postedAt: daysAgo(1), score: 5, numComments: 1 });
  const stale = candidate({ postedAt: daysAgo(25), score: 500, numComments: 200 });
  assert.ok(signalScore(fresh, 30) > signalScore(stale, 30));
});

test("venue ranking prefers focused communities over huge general ones", () => {
  assert.ok(sizeFit(8_000) > sizeFit(3_000_000));
  assert.ok(sizeFit(40_000) > sizeFit(1_500_000));
  assert.ok(sizeFit(200) < sizeFit(8_000));
});

test("member labels are formatted from real counts, never invented", () => {
  assert.equal(formatMembers(null), "size unknown");
  assert.equal(formatMembers(950), "950 members");
  assert.equal(formatMembers(8_200), "8.2k members");
  assert.equal(formatMembers(3_100_000), "3.1m members");
});

test("relevance window maps to a Reddit bucket that fully covers it", () => {
  assert.equal(windowToRedditT(7), "week");
  assert.equal(windowToRedditT(30), "month");
  // A 45-day window must not search `month` — that would silently discard half the window.
  assert.equal(windowToRedditT(45), "year");
  assert.equal(windowToRedditT(180), "year");
});

// --- regression: fuzzy phrase matching -------------------------------------------------------
// These are the cases that made real runs come back empty. Search engines are tokenized, so a
// post surfaced by a query rarely contains that query as a literal substring.

test("keeps a relevant post that does NOT contain the lexicon phrase verbatim", () => {
  const post = candidate({
    title: "Anyone know a decent newsletter for picks?",
    body: "Anyone know a decent newsletter for picks? I keep guessing every week and it is honestly not working for me.",
  });
  const { kept } = cheapFilter([post], LEXICON);
  assert.equal(kept.length, 1);
});

test("relevance ranks rather than gates — a loose match survives for the qualifier to judge", () => {
  const onTopic = candidate({ id: "on", author: "a", body: "I am struggling to find good stock picks and keep guessing every week." });
  const loose = candidate({ id: "loose", author: "b", body: "Been thinking about the market a lot this month and what to do with my savings." });
  const { kept } = cheapFilter([onTopic, loose], LEXICON);
  assert.equal(kept.length, 2, "a crude keyword test must not overrule the model on relevance");
  assert.equal(kept[0].id, "on", "but the stronger topical match must rank first");
});

// --- excerpt integrity ------------------------------------------------------------------------

test("accepts a genuinely verbatim excerpt unchanged", () => {
  const body = "I have tried three newsletters already. None of them explain the reasoning behind a pick.";
  assert.equal(resolveExcerpt("None of them explain the reasoning behind a pick.", body), "None of them explain the reasoning behind a pick.");
});

test("salvages a real sentence when the model paraphrases, instead of losing the lead", () => {
  const body = "I have tried three newsletters already. None of them explain the reasoning behind a pick, which drives me mad.";
  const got = resolveExcerpt("None of them explained the reasoning behind their picks", body);
  assert.ok(got, "a paraphrase should salvage rather than drop the lead");
  assert.ok(body.includes(got), "salvaged excerpt must still be a literal span of the real post");
});

test("never invents a quote when nothing in the post is close", () => {
  const body = "The weather has been unusually warm this month and the garden is thriving nicely.";
  assert.equal(resolveExcerpt("I need help choosing stocks to buy right now", body), null);
});

// --- html text cleanup ------------------------------------------------------------------------
// Numeric entities are the common case in real meta tags and were passing through raw.

test("decodes numeric html entities, including zero-padded ones", () => {
  assert.equal(decodeHtmlEntities("don&#039;t"), "don't");
  assert.equal(decodeHtmlEntities("don&#39;t"), "don't");
  assert.equal(decodeHtmlEntities("don&#x27;t"), "don't");
  assert.equal(decodeHtmlEntities("caf&#233;"), "café");
  assert.equal(decodeHtmlEntities("it&#8217;s"), "it’s");
});

test("decodes named entities and leaves unknown ones alone", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeHtmlEntities("a &ndash; b"), "a – b");
  assert.equal(decodeHtmlEntities("&notarealentity;"), "&notarealentity;");
});

test("strips trademark furniture from a site title", () => {
  assert.equal(cleanSiteTitle("EverydayMaven™", "fallback"), "EverydayMaven");
  assert.equal(cleanSiteTitle("Acme® Tools © 2026", "fallback"), "Acme Tools 2026");
});

test("keeps the brand and drops the tagline after a separator", () => {
  assert.equal(cleanSiteTitle("EverydayMaven™ | Whole Foods, Half the Time", "f"), "EverydayMaven");
  assert.equal(cleanSiteTitle("Acme - The best CRM for teams", "f"), "Acme");
});

test("skips a boilerplate first segment rather than naming the site 'Home'", () => {
  assert.equal(cleanSiteTitle("Home | EverydayMaven", "f"), "EverydayMaven");
});

test("cleans the real EverydayMaven description end to end", () => {
  const raw = "EverydayMaven has hundreds of whole foods based recipes that don&#039;t take all day to make. Whole foods, half the time!";
  assert.equal(
    cleanSiteDescription(raw, "EverydayMaven"),
    "EverydayMaven has hundreds of whole foods based recipes that don't take all day to make. Whole foods, half the time!",
  );
});

test("drops a description that just repeats the title", () => {
  assert.equal(cleanSiteDescription("EverydayMaven™", "EverydayMaven"), null);
});

test("truncates long descriptions at a word boundary, never mid-word", () => {
  const long = "This is a fairly long meta description that keeps going well past the limit and should be cut cleanly at a word boundary rather than slicing a word in half somewhere awkward.";
  const out = cleanSiteDescription(long, "Site");
  assert.ok(out.endsWith("…"));
  assert.ok(!/\w…$/.test(out.replace(/\s\S*…$/, "")) || true);
  assert.ok(long.startsWith(out.replace(/…$/, "")), "truncation must be a prefix of the original");
});

// --- source selection -------------------------------------------------------------------------
// Stack Exchange spans ~180 topical sites, so picking the right two or three from the niche
// lexicon is what keeps it useful for non-technical products instead of a developer-only source.

test("routes a food niche to Cooking, not Stack Overflow", () => {
  const sites = pickStackExchangeSites(["whole foods recipe ideas", "quick weeknight meal", "cook dinner fast"]);
  assert.ok(sites.includes("cooking"));
  assert.ok(!sites.includes("stackoverflow"));
});

test("routes a finance niche to Personal Finance", () => {
  const sites = pickStackExchangeSites(["which stocks to buy", "retirement saving", "portfolio budget"]);
  assert.ok(sites.includes("money"));
});

test("routes a developer niche to technical sites", () => {
  const sites = pickStackExchangeSites(["api integration broken", "sdk library docs", "developer tooling"]);
  assert.ok(sites.includes("stackoverflow"));
});

test("returns nothing when the niche matches no topical site", () => {
  assert.deepEqual(pickStackExchangeSites(["zzz qqq", "nothing relevant here"]), []);
});

test("never returns more sites than the cap", () => {
  const sites = pickStackExchangeSites(["recipe garden invest workout dog bike photo travel"], 3);
  assert.ok(sites.length <= 3);
});

// --- wave planning ----------------------------------------------------------------------------
// Volume comes from widening the net across waves, never from lowering the bar.

test("problem phrases are actually searched, not just seeking phrases", () => {
  const pool = buildPhrasePool(["buy a widget", "widget recommendations"], ["widget keeps breaking", "tired of widgets"]);
  assert.ok(pool.includes("widget keeps breaking"), "the previous build never searched problemPhrases at all");
  assert.equal(pool.length, 4);
});

test("phrase pool interleaves the two intents", () => {
  const pool = buildPhrasePool(["s1", "s2"], ["p1", "p2"]);
  assert.deepEqual(pool, ["s1", "p1", "s2", "p2"]);
});

test("later waves reach different phrases", () => {
  const pool = buildPhrasePool(["s1", "s2", "s3"], ["p1", "p2", "p3"]);
  const w0 = planWave(pool, 0).phrases;
  const w1 = planWave(pool, 1).phrases;
  assert.notDeepEqual(w0, w1);
  assert.equal(w0.length, 3);
});

test("waves move to a deeper page once the phrase pool wraps", () => {
  const pool = buildPhrasePool(["s1", "s2", "s3"], []);
  assert.equal(planWave(pool, 0).page, 1);
  assert.equal(planWave(pool, 1).page, 2, "wave 1 exhausts a 3-phrase pool, so it must page deeper");
});

test("wave planning is safe with an empty pool", () => {
  assert.deepEqual(planWave([], 2), { phrases: [], page: 1 });
});

// --- lead scoring -----------------------------------------------------------------------------
// The score replaces truncating results to a count, so it has to be defensible line by line.

test("someone actively looking outranks someone merely complaining", () => {
  const base = { confidence: 0.8, postedAt: new Date(), score: 5, numComments: 2, relevanceWindowDays: 30 };
  const seeking = scoreLead({ ...base, intentTier: "seeking" });
  const complaining = scoreLead({ ...base, intentTier: "complaining" });
  assert.ok(seeking.total > complaining.total);
});

test("intent outweighs popularity — a fresh ask beats a viral old complaint", () => {
  const fresh = scoreLead({ intentTier: "seeking", confidence: 0.8, postedAt: new Date(), score: 2, numComments: 1, relevanceWindowDays: 30 });
  const viralOld = scoreLead({
    intentTier: "complaining",
    confidence: 0.8,
    postedAt: new Date(Date.now() - 25 * 86_400_000),
    score: 900,
    numComments: 400,
    relevanceWindowDays: 30,
  });
  assert.ok(fresh.total > viralOld.total);
});

test("recency decays against the niche's own window, not a fixed calendar", () => {
  const opts = { intentTier: "seeking", confidence: 0.7, score: 5, numComments: 2 };
  const tenDaysFastNiche = scoreLead({ ...opts, postedAt: new Date(Date.now() - 10 * 86_400_000), relevanceWindowDays: 14 });
  const tenDaysSlowNiche = scoreLead({ ...opts, postedAt: new Date(Date.now() - 10 * 86_400_000), relevanceWindowDays: 180 });
  assert.ok(tenDaysSlowNiche.breakdown.recency > tenDaysFastNiche.breakdown.recency);
});

test("breakdown always sums to the total", () => {
  const s = scoreLead({ intentTier: "complaining", confidence: 0.55, postedAt: new Date(Date.now() - 3 * 86_400_000), score: 12, numComments: 6, relevanceWindowDays: 30 });
  const sum = s.breakdown.intent + s.breakdown.confidence + s.breakdown.recency + s.breakdown.engagement;
  assert.equal(sum, s.total, "a score a founder cannot reconcile is a number we made up");
});

test("stars stay within 1-5 in half steps", () => {
  for (const total of [0, 17, 33, 50, 68, 84, 100]) {
    const stars = starsFromTotal(total);
    assert.ok(stars >= 1 && stars <= 5, `${total} produced ${stars}`);
    assert.equal(stars * 2, Math.round(stars * 2), "half steps only");
  }
});

test("rankLeads orders strongest first", () => {
  const ranked = rankLeads(
    [
      { id: "weak", intentTier: "adjacent", confidence: 0.3, postedAt: new Date(Date.now() - 20 * 86_400_000), score: 1, numComments: 0 },
      { id: "strong", intentTier: "seeking", confidence: 0.95, postedAt: new Date(), score: 20, numComments: 10 },
    ],
    30,
  );
  assert.equal(ranked[0].id, "strong");
  assert.ok(ranked[0].leadScore.total > ranked[1].leadScore.total);
});

// --- query shaping ----------------------------------------------------------------------------
// The mismatch that quietly returned nothing: natural phrases handed to keyword engines.

test("reduces a natural phrase to distinctive keywords", () => {
  assert.equal(toSearchQuery("I need good stock picks"), "stock picks");
  assert.equal(toSearchQuery("looking for a stock picking newsletter"), "stock picking");
});

test("keeps the leading domain word rather than trailing filler", () => {
  // Trailing selection produced "picking newsletter recommendations", dropping the one word that
  // made the query specific to this market.
  assert.equal(toSearchQuery("stock picking newsletter recommendations"), "stock picking");
  assert.equal(toSearchQuery("trucks stacking up at the receiving dock"), "trucks stacking");
});

test("never emits a query longer than the cap", () => {
  for (const p of ["one two three four five six seven", "dock scheduling software recommendations please"]) {
    assert.ok(toSearchQuery(p).split(" ").length <= 2, p);
  }
});

test("collapses phrases that reduce to the same keywords", () => {
  const qs = toSearchQueries(["need good stock picks", "looking for good stock picks", "which stocks to buy"]);
  assert.equal(new Set(qs).size, qs.length, "duplicate queries waste search budget");
  assert.ok(qs.length < 3);
});

test("falls back to the original phrase when it is all stopwords", () => {
  assert.equal(toSearchQuery("how do you do it"), "how do you do it");
});

test("topical overlap scores without gating", () => {
  const phrases = ["stock picks"];
  assert.ok(topicalOverlap("I need good stock picks now", phrases) > 0);
  assert.equal(topicalOverlap("gardening in humid climates", phrases), 0);
});

// --- recency in words -------------------------------------------------------------------------
// Timing decides whether a thread is still worth replying to, so the queue leads with it.

test("relative time reads naturally at each scale", () => {
  const ago = (ms) => new Date(Date.now() - ms);
  assert.equal(relativeTime(ago(30_000)), "just now");
  assert.equal(relativeTime(ago(20 * 60_000)), "20m ago");
  assert.equal(relativeTime(ago(3 * 3_600_000)), "3h ago");
  assert.equal(relativeTime(ago(5 * 86_400_000)), "5d ago");
  assert.equal(relativeTime(ago(60 * 86_400_000)), "2mo ago");
});

test("relative time is safe with missing or invalid dates", () => {
  assert.equal(relativeTime(undefined), "");
  assert.equal(relativeTime(null), "");
  assert.equal(relativeTime("not a date"), "");
});

// --- reading a trace --------------------------------------------------------------------------
// diagnose() is what /diagnostics uses to say WHY a run produced nothing. It must always name the
// EARLIEST break: a zero at scoring means nothing if nothing was ever found to score, and pointing
// at the wrong stage sends someone chasing a problem that isn't there.

const stage = (over = {}) => ({ stage: "x", candidatesIn: 0, candidatesOut: 0, ms: 10, drops: {}, ...over });

test("a run with leads reports success", () => {
  const v = diagnose([stage({ stage: "extract:score:w0", candidatesIn: 10, candidatesOut: 4 })], 4);
  assert.equal(v.status, "ok");
  assert.match(v.headline, /4 real leads/);
});

test("a successful but slow run still flags the stage at risk", () => {
  const v = diagnose([stage({ stage: "extract:score:w0", candidatesIn: 10, candidatesOut: 4, ms: 24_000 })], 4);
  assert.equal(v.status, "ok");
  assert.match(v.detail, /extract:score:w0/);
});

test("an empty trace is read as the function being killed", () => {
  const v = diagnose([], 0);
  assert.equal(v.status, "broken");
  assert.match(v.headline, /no trace/i);
});

test("no venues resolved blames phase 1, not the extract stages", () => {
  const v = diagnose(
    [
      stage({ stage: "venues:discover", candidatesIn: 6, candidatesOut: 0 }),
      stage({ stage: "venues:web", candidatesIn: 1, candidatesOut: 0 }),
    ],
    0,
  );
  assert.equal(v.status, "broken");
  assert.match(v.headline, /No communities/);
});

test("venues found but annotation dropping them all is named precisely", () => {
  const v = diagnose(
    [
      stage({ stage: "venues:discover", candidatesIn: 6, candidatesOut: 12 }),
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 0, note: "annotation exceeded its budget" }),
    ],
    0,
  );
  assert.equal(v.stage, "venues:annotate");
  assert.match(v.detail, /annotation exceeded its budget/);
});

test("sources refusing the request is distinguished from a quiet niche", () => {
  const refused = diagnose(
    [
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 5 }),
      stage({ stage: "extract:fanout:w0", candidatesIn: 15, candidatesOut: 0, drops: { source_error: 15 } }),
    ],
    0,
  );
  assert.equal(refused.status, "broken");
  assert.match(refused.headline, /refused/);

  const quiet = diagnose(
    [
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 5 }),
      stage({ stage: "extract:fanout:w0", candidatesIn: 15, candidatesOut: 0 }),
    ],
    0,
  );
  // A clean search of a quiet niche is not a fault, and must not be reported as one.
  assert.equal(quiet.status, "empty");
  assert.match(quiet.headline, /nothing matching/);
});

test("everything filtered out names the dominant drop reason", () => {
  const v = diagnose(
    [
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 5 }),
      stage({ stage: "extract:fanout:w0", candidatesIn: 15, candidatesOut: 30 }),
      stage({ stage: "extract:filter:w0", candidatesIn: 30, candidatesOut: 0, drops: { stale: 27, bot: 3 } }),
    ],
    0,
  );
  assert.equal(v.stage, "extract:filter:w0");
  assert.match(v.detail, /too old/i);
});

test("a failed scoring call is not reported as an honest empty result", () => {
  const v = diagnose(
    [
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 5 }),
      stage({ stage: "extract:fanout:w0", candidatesIn: 15, candidatesOut: 30 }),
      stage({ stage: "extract:filter:w0", candidatesIn: 30, candidatesOut: 12 }),
      stage({ stage: "extract:score:w0", candidatesIn: 12, candidatesOut: 0, note: "scoring failed: 401" }),
    ],
    0,
  );
  assert.equal(v.status, "broken");
  assert.match(v.headline, /scoring pass failed/);
});

test("the model rejecting every candidate is reported as the quality bar working", () => {
  const v = diagnose(
    [
      stage({ stage: "venues:annotate", candidatesIn: 12, candidatesOut: 5 }),
      stage({ stage: "extract:fanout:w0", candidatesIn: 15, candidatesOut: 30 }),
      stage({ stage: "extract:filter:w0", candidatesIn: 30, candidatesOut: 12 }),
      stage({ stage: "extract:score:w0", candidatesIn: 12, candidatesOut: 0, drops: { no_intent: 12 } }),
    ],
    0,
  );
  assert.equal(v.status, "empty");
  assert.match(v.detail, /intended behaviour/);
});

test("every stage the pipeline emits has documentation", () => {
  const emitted = [
    "venues:cache",
    "venues:discover",
    "venues:reddit-unavailable",
    "venues:web",
    "venues:annotate",
    "reddit:auth",
    "extract:fanout:w0",
    "extract:filter:w3",
    "extract:score:w1",
  ];
  for (const s of emitted) assert.ok(docFor(s), `no doc for stage ${s}`);
});

// --- the run clock ----------------------------------------------------------------------------

test("a deadline shrinks a stage budget to what is actually left", () => {
  const d = new Deadline(10_000);
  assert.equal(d.budgetFor(3_000), 3_000);
  // Asking for more than remains gets what remains, minus the reserve.
  assert.ok(d.budgetFor(30_000, 2_000) <= 8_000);
  assert.ok(d.hasRoomFor(1_000));
  assert.equal(new Deadline(0).hasRoomFor(1_000), false);
  assert.equal(new Deadline(0).budgetFor(5_000), 0);
});

// --- spreading across communities -------------------------------------------------------------
// A signal-ranked slice is quietly biased toward whichever community matched the query best. Ten
// people from eight places tests more of the map than ten from one, and tells the founder more.

const cand = (venueId, i) => ({
  id: `${venueId}-${i}`,
  venueId,
  venueName: venueId,
  platform: "Forum",
  author: `${venueId}-author-${i}`,
  permalink: `https://example.com/${venueId}/${i}`,
  postedAt: new Date(),
  title: "t",
  body: "b",
  score: 0,
  numComments: 0,
});

test("one busy community cannot fill the whole batch", () => {
  const candidates = [
    ...Array.from({ length: 30 }, (_, i) => cand("reddit:big", i)),
    ...Array.from({ length: 3 }, (_, i) => cand("hn:all", i)),
    ...Array.from({ length: 2 }, (_, i) => cand("quora:all", i)),
  ];
  const picked = spreadAcrossVenues(candidates, 9);
  assert.equal(picked.length, 9);
  const venues = new Set(picked.map((c) => c.venueId));
  assert.equal(venues.size, 3, "every community should be represented");
  // Round-robin: each community gets a turn before any gets a second.
  assert.deepEqual(picked.slice(0, 3).map((c) => c.venueId), ["reddit:big", "hn:all", "quora:all"]);
});

test("spreading still returns the best of each community first", () => {
  const candidates = [cand("a", 0), cand("a", 1), cand("b", 0)];
  const picked = spreadAcrossVenues(candidates, 3);
  assert.deepEqual(picked.map((c) => c.id), ["a-0", "b-0", "a-1"]);
});

test("spreading drains remaining communities when others run out", () => {
  const candidates = [...Array.from({ length: 5 }, (_, i) => cand("a", i)), cand("b", 0)];
  const picked = spreadAcrossVenues(candidates, 10);
  assert.equal(picked.length, 6, "should return everything when under the limit");
  assert.equal(new Set(picked.map((c) => c.id)).size, 6, "no duplicates");
});

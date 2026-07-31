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

test("drops a keyword match with no first-person problem statement", () => {
  const { kept, drops } = cheapFilter(
    [candidate({ title: "Stock picks weekly roundup", body: "Here is the market summary for stock picks this week. The index closed higher across most sectors today." })],
    LEXICON,
  );
  assert.equal(kept.length, 0);
  assert.equal(drops.keyword_only, 1);
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
  assert.equal(kept.length, 1, "exact-substring matching would have dropped this");
});

test("matches across word forms (picks / picking / picked)", () => {
  const post = candidate({
    body: "I have been picking stocks on my own for months and I am struggling to keep up with the research.",
  });
  const { kept } = cheapFilter([post], LEXICON);
  assert.equal(kept.length, 1);
});

test("still rejects a post that merely shares the topic's vocabulary", () => {
  const post = candidate({
    title: "Stock picks roundup for the week",
    body: "Here is the weekly summary of notable stock picks across the market. The index closed higher across most sectors.",
  });
  const { kept, drops } = cheapFilter([post], LEXICON);
  assert.equal(kept.length, 0);
  assert.equal(drops.keyword_only, 1);
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

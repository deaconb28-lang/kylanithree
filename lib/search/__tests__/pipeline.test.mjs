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

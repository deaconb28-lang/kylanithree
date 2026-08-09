// Person identity and person scraping.
//
// The identity tests exist because the bug they cover was silent and expensive: every Discourse
// forum has its own "john", the fingerprint was built from the bare username, and so one identity
// wore several strangers' posts. Nothing failed, nothing logged, and the wrong person's words were
// attributed to whoever the crawler saw last. Widening the registry to 31 forums multiplied it.
//
// Run: node --test lib/search/__tests__/people.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { personFingerprint } from "../../../.test-build/lib/credits/fingerprint.js";
import { fetchPersonProfile, MAX_ENRICH_ATTEMPTS } from "../../../.test-build/lib/ingest/people.js";

const person = (over) => ({
  fingerprint: "f",
  platform: "discourse",
  handle: "example.org/someone",
  firstSeen: new Date(),
  lastSeen: new Date(),
  postCount: 1,
  activityScore: 0.5,
  ...over,
});

test("the same Discourse username on two forums is two different people", () => {
  const a = personFingerprint({ platform: "discourse", authorHandle: "forum.obsidian.md/john" });
  const b = personFingerprint({ platform: "discourse", authorHandle: "community.n8n.io/john" });
  assert.ok(a && b);
  assert.notEqual(a, b);
});

test("the same Stack Exchange display name on two sites is two different people", () => {
  const a = personFingerprint({ platform: "stackexchange", authorHandle: "cooking/Alex" });
  const b = personFingerprint({ platform: "stackexchange", authorHandle: "workplace/Alex" });
  assert.ok(a && b);
  assert.notEqual(a, b);
});

test("a qualified handle is still stable across runs", () => {
  const once = personFingerprint({ platform: "discourse", authorHandle: "forum.obsidian.md/john" });
  const twice = personFingerprint({ platform: "discourse", authorHandle: "forum.obsidian.md/john" });
  assert.equal(once, twice);
});

test("HN needs no qualification — one flat site, one namespace", () => {
  const a = personFingerprint({ platform: "hn", authorHandle: "pg" });
  const b = personFingerprint({ platform: "hn", authorHandle: "pg" });
  assert.equal(a, b);
  // And it must not collide with a Discourse user who happens to share the name.
  assert.notEqual(a, personFingerprint({ platform: "discourse", authorHandle: "meta.discourse.org/pg" }));
});

// --- enrichment addressability -------------------------------------------------------------------
// These make no network call: each returns null before any fetch, which is the point — an
// unaddressable person must be cheap to skip, not a request that fails.

test("Stack Exchange without a numeric id is unaddressable", async () => {
  const got = await fetchPersonProfile(person({ platform: "stackexchange", scope: "cooking", handle: "cooking/Alex" }));
  assert.equal(got, null);
});

test("Discourse without a host is unaddressable", async () => {
  const got = await fetchPersonProfile(person({ platform: "discourse", scope: undefined }));
  assert.equal(got, null);
});

test("an unknown platform is unaddressable rather than an error", async () => {
  const got = await fetchPersonProfile(person({ platform: "myspace", scope: "all", handle: "tom" }));
  assert.equal(got, null);
});

test("the retry ceiling is a real bound", () => {
  assert.ok(Number.isInteger(MAX_ENRICH_ATTEMPTS) && MAX_ENRICH_ATTEMPTS > 0);
});

// --- Stack Exchange routing ----------------------------------------------------------------------
// Regression tests for a bug caught on a live production run rather than in review: site keywords
// were matched with a bare substring test, so "scattered" put an issue tracker on Pets and
// "planning tools" put it on DIY.

import { pickStackExchangeSites } from "../../../.test-build/lib/search/seSites.js";

test("a substring inside a longer word does not pick a site", () => {
  // "scattered" contains "cat"; "communication" contains "cat" too.
  assert.ok(!pickStackExchangeSites(["scattered feature requests everywhere"]).includes("pets"));
  assert.ok(!pickStackExchangeSites(["customer communication is scattered"]).includes("pets"));
  // "category" is the other one that used to reach Pets.
  assert.ok(!pickStackExchangeSites(["organise issues by category"]).includes("pets"));
});

test("an issue tracker is not routed to DIY by the word 'tools'", () => {
  assert.ok(!pickStackExchangeSites(["roadmap planning tools for product teams"]).includes("diy"));
});

test("genuine mentions still match, including plurals and -ing", () => {
  assert.ok(pickStackExchangeSites(["my dog keeps barking at the vet"]).includes("pets"));
  assert.ok(pickStackExchangeSites(["drywall repair and plumbing"]).includes("diy"));
  assert.ok(pickStackExchangeSites(["gardening in poor soil"]).includes("gardening"));
  assert.ok(pickStackExchangeSites(["recipes for a low sodium diet"]).includes("cooking"));
});

test("a product with no niche overlap picks nothing rather than something wrong", () => {
  assert.deepEqual(pickStackExchangeSites(["distributed tracing for microservice latency"]).includes("pets"), false);
});

// --- pass 1: corpus route ------------------------------------------------------------------------
// The shallow pass is a database read. When the Atlas Search index is missing it degrades to a
// regex scan, and the predicate below is what decides that — so it has to be narrow. Too broad and
// a timeout or an auth failure gets quietly reclassified as "the corpus was thin", which is the
// exact silent-failure mode this work exists to remove.

import { isMissingSearchIndex } from "../../../.test-build/lib/discover/passOne.js";

test("a missing Atlas Search index is recognised", () => {
  for (const m of [
    "PlanExecutorError: index not found: corpus_lexical",
    'Search index "corpus_lexical" not found',
    "no such index",
    "SearchNotEnabled: Atlas Search is not enabled for this cluster",
  ]) {
    assert.equal(isMissingSearchIndex(new Error(m)), true, m);
  }
});

test("a real fault is NOT treated as a missing index", () => {
  for (const m of [
    "connection timed out",
    "server selection timed out after 12000 ms",
    "not authorized on kylani to execute command",
    "MongoNetworkError: connection 4 to cluster0 closed",
    "Remote error from mongot :: caused by :: Query failed",
  ]) {
    assert.equal(isMissingSearchIndex(new Error(m)), false, m);
  }
});

test("a non-Error rejection is still classified rather than crashing", () => {
  assert.equal(isMissingSearchIndex("index not found: corpus_lexical"), true);
  assert.equal(isMissingSearchIndex(null), false);
  assert.equal(isMissingSearchIndex(undefined), false);
});

// --- relevance-selected excerpts ------------------------------------------------------------------
// What a founder is shown from a post. The old behaviour was the first ~240 characters, which on a
// forum is a greeting — a lead reading "Hi all, first time posting" tells them nothing about
// whether the person is worth writing to.

import { relevantExcerpt } from "../../../.test-build/lib/search/excerpt.js";

const FORUM_POST = [
  "Hi everyone, first time posting here so apologies if this is the wrong subforum.",
  "A bit of background: we are a team of about forty, mostly remote, spread over three time zones.",
  "The real problem is that feature requests arrive in five different places and nobody can tell what is actually planned.",
  "We have tried spreadsheets and a shared inbox and both fell over within a month.",
  "Happy to hear what has worked for other people.",
].join(" ");

test("the excerpt is the part about the founder's product, not the greeting", () => {
  const got = relevantExcerpt(FORUM_POST, ["feature requests scattered", "what is actually planned"], 260);
  assert.ok(got.includes("feature requests arrive in five different places"), got);
  assert.ok(!got.startsWith("Hi everyone"), got);
});

test("a mid-post quote is marked as one so it does not read as the opening", () => {
  const got = relevantExcerpt(FORUM_POST, ["feature requests"], 200);
  assert.ok(got.startsWith("…"), got);
});

test("short posts are returned whole, with no ellipsis theatre", () => {
  const short = "Our spreadsheet for tracking feature requests has completely fallen apart.";
  assert.equal(relevantExcerpt(short, ["feature requests"], 260), short);
});

test("no keyword match still returns real text rather than nothing", () => {
  const got = relevantExcerpt(FORUM_POST, ["entirely unrelated vocabulary"], 120);
  assert.ok(got.length > 20);
  assert.ok(FORUM_POST.startsWith(got.replace(/…$/, "").trim().slice(0, 30)));
});

test("the excerpt is always a literal span of the post", () => {
  const got = relevantExcerpt(FORUM_POST, ["feature requests", "spreadsheets"], 260);
  const stripped = got.replace(/^…/, "").replace(/…$/, "").trim();
  assert.ok(FORUM_POST.includes(stripped), `not a literal span: ${stripped}`);
});

test("the cap is respected", () => {
  for (const max of [80, 150, 260]) {
    const got = relevantExcerpt(FORUM_POST, ["feature requests"], max);
    assert.ok(got.replace(/…/g, "").length <= max + 2, `${got.length} > ${max}`);
  }
});

// --- why this person -------------------------------------------------------------------------------
// matchedFor shipped EMPTY for every lead in production: it whole-phrase-substring-matched inferred
// keywords like "scattered feature requests everywhere", which never appear verbatim in a real post.
// The card could not say why the person was there — the one thing a founder needs to trust it.

import { matchedTerms, vocabularyOverlap } from "../../../.test-build/lib/search/excerpt.js";

const KEYWORDS = ["scattered feature requests everywhere", "team losing track of priorities"];

test("a phrase that never appears verbatim still matches on its real words", () => {
  const post = "Our feature requests are scattered across four tools and nobody knows what is planned.";
  const got = matchedTerms(post, KEYWORDS);
  assert.ok(got.includes("scattered feature requests everywhere"), JSON.stringify(got));
  // And the whole-phrase test it replaced would have found nothing at all.
  assert.equal(KEYWORDS.filter((k) => post.toLowerCase().includes(k.toLowerCase())).length, 0);
});

test("one incidental word is not a match", () => {
  // "requests" alone, in a post about something else entirely.
  const post = "How do I rate limit inbound requests to an nginx box behind a load balancer?";
  assert.deepEqual(matchedTerms(post, KEYWORDS), []);
});

test("an unrelated post scores far below a related one", () => {
  const related = "Feature requests are scattered and the team keeps losing track of priorities.";
  const unrelated = "Needs a tool to verify that a Bitcoin Core node is functioning correctly.";
  assert.ok(vocabularyOverlap(related, KEYWORDS) > vocabularyOverlap(unrelated, KEYWORDS));
  assert.ok(vocabularyOverlap(unrelated, KEYWORDS) < 0.12, "the Bitcoin post must fall under the floor");
});

test("no keywords means no floor — never filter when there is nothing to filter on", () => {
  assert.equal(vocabularyOverlap("anything at all", []), 1);
});

test("a reason is only claimed when it is visible in the quote shown", () => {
  // The failure this encodes: scoring the whole document labelled a post about SSE resilience
  // testing "losing track of feature requests", because those words appeared far from the quote.
  const body = [
    "We keep losing track of feature requests across tools.",
    "Separately, I need to simulate connection loss between a Python client and server to test SSE resilience.",
  ].join(" ");
  const kw = ["losing track of feature requests"];

  // A quote taken from the second half must not carry a reason drawn from the first.
  const secondHalf = "I need to simulate connection loss between a Python client and server to test SSE resilience.";
  assert.deepEqual(matchedTerms(secondHalf, kw), []);
  // While the whole body would have claimed it.
  assert.ok(matchedTerms(body, kw).length > 0);
});

// --- summary vs quote ------------------------------------------------------------------------------
// Two different claims. The summary says what a lead is about and may be the classifier's
// third-person restatement; the quote is evidence and is always the person's own words. They were
// previously the same field, so a classified lead had its restatement rendered inside quote marks —
// attributing to a real person a sentence nobody wrote.

import { leadSummary } from "../../../.test-build/lib/search/excerpt.js";

test("the classifier's restatement is used as the summary when present", () => {
  const got = leadSummary({
    problemStatement: "needs a project management tool to replace Microsoft Project",
    body: FORUM_POST,
    keywords: ["feature requests"],
  });
  assert.equal(got, "needs a project management tool to replace Microsoft Project");
});

test("without a classifier statement the summary is the post's own strongest sentence", () => {
  const got = leadSummary({ body: FORUM_POST, keywords: ["feature requests", "what is actually planned"] });
  assert.ok(got.includes("feature requests"), got);
  // And it is the person's real words, so it can be checked against the post.
  assert.ok(FORUM_POST.includes(got.replace(/…$/, "").trim()), got);
});

test("a summary is one sentence, not the whole quote", () => {
  const got = leadSummary({ body: FORUM_POST, keywords: ["feature requests"], maxChars: 150 });
  assert.ok(got.length <= 152, `${got.length}`);
});

test("nothing relevant means no summary rather than a misleading one", () => {
  assert.equal(leadSummary({ body: "short", keywords: ["feature requests"] }), undefined);
});

test("a two-word phrase needs both words, not either one", () => {
  // "linear alternative" matched posts about git hosting, Cisco Packet Tracer and OctoPrint in
  // production, every one of them on the word "alternative" alone.
  const kw = ["linear alternative"];
  assert.deepEqual(matchedTerms("looking for an alternative to OctoPrint for managing 3D prints", kw), []);
  assert.deepEqual(matchedTerms("wants a git hosting alternative to GitHub with LFS", kw), []);
  assert.deepEqual(matchedTerms("we are evaluating a Linear alternative for our roadmap", kw), kw);
});

test("a longer phrase still matches on most of its words", () => {
  const kw = ["scattered feature requests everywhere"];
  assert.deepEqual(matchedTerms("our feature requests are scattered across four tools", kw), kw);
  // But never on one word alone.
  assert.deepEqual(matchedTerms("how do I rate limit inbound requests to nginx", kw), []);
});

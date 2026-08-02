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

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

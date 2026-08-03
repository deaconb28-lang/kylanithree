// Identity across federated networks and across the two retrieval routes.
//
// Both bugs covered here are silent, and both are the same bug wearing different clothes: an
// identity key built out of something that is not identity.
//
// 1. FEDERATION. A Lemmy post fetched from programming.dev is often not FROM programming.dev — the
//    creator's `actor_id` names their home instance, which can be any server on the network. Keying
//    on the instance we happened to poll would split one human across every instance that federated
//    their post, and merge two unrelated people who picked the same username on different servers.
//    This is the Discourse namespacing bug from people.test.mjs, one layer deeper.
//
// 2. DISPLAY LABELS AS KEYS. `Candidate.platform` is a display union in which "Forum" means Stack
//    Exchange, Discourse, Lemmy and Quora, and "X" meant both X and Bluesky. The fingerprint hashed
//    it. Pass 1 merges the corpus route with the live route by fingerprint, and the corpus stores
//    "hn" where the live source said "Hacker News" — so the same person coming down both routes
//    could never match, and shipped twice.
//
// Run: node --test lib/search/__tests__/federation.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { personFingerprint } from "../../../.test-build/lib/credits/fingerprint.js";
import { homeHostOf, lemmyUserQuery } from "../../../.test-build/lib/ingest/sources/lemmy.js";
import { describeTenure } from "../../../.test-build/lib/people/profiles.js";

// --- federation ---

test("a remote creator's home host comes from actor_id, not the instance we polled", () => {
  const host = homeHostOf({ name: "tofu", actor_id: "https://lemmy.nocturnal.garden/u/tofu", local: false }, "programming.dev");
  assert.equal(host, "lemmy.nocturnal.garden");
});

test("a local creator resolves to the instance we polled", () => {
  const host = homeHostOf({ name: "dessalines", actor_id: "https://lemmy.ml/u/dessalines", local: true }, "lemmy.ml");
  assert.equal(host, "lemmy.ml");
});

test("a missing or unparseable actor_id falls back to the polled host rather than throwing", () => {
  assert.equal(homeHostOf({ name: "x" }, "lemmy.world"), "lemmy.world");
  assert.equal(homeHostOf({ name: "x", actor_id: "not a url" }, "lemmy.world"), "lemmy.world");
  assert.equal(homeHostOf(undefined, "lemmy.world"), "lemmy.world");
});

test("one person seen through two instances is one person", () => {
  // The same human, surfaced by two different instances that both federated the post.
  const viaProgramming = homeHostOf({ name: "tofu", actor_id: "https://lemmy.nocturnal.garden/u/tofu" }, "programming.dev");
  const viaWorld = homeHostOf({ name: "tofu", actor_id: "https://lemmy.nocturnal.garden/u/tofu" }, "lemmy.world");
  const a = personFingerprint({ platform: "lemmy", authorHandle: `${viaProgramming}/tofu` });
  const b = personFingerprint({ platform: "lemmy", authorHandle: `${viaWorld}/tofu` });
  assert.ok(a);
  assert.equal(a, b);
});

test("the same username on two home instances is two people", () => {
  const a = personFingerprint({ platform: "lemmy", authorHandle: "lemmy.world/tofu" });
  const b = personFingerprint({ platform: "lemmy", authorHandle: "lemmy.nocturnal.garden/tofu" });
  assert.ok(a && b);
  assert.notEqual(a, b);
});

test("a profile lookup uses the bare name at home and the qualified name away from it", () => {
  // Confirmed against the live API: asking lemmy.world for "Deep@lemmy.world" answers 404, and the
  // bare name works. The remote form is the one that needs qualifying.
  assert.equal(lemmyUserQuery("lemmy.world/Deep", "lemmy.world"), "Deep");
  assert.equal(lemmyUserQuery("lemmy.nocturnal.garden/tofu", "programming.dev"), "tofu@lemmy.nocturnal.garden");
});

test("an unqualified handle is passed through unchanged", () => {
  assert.equal(lemmyUserQuery("tofu", "lemmy.world"), "tofu");
});

// --- display labels are not identity ---

test("a person found live dedupes against the same person found in the corpus", () => {
  // The corpus stores the canonical id; the live source now sends the same one as `networkId`.
  const corpus = personFingerprint({ platform: "hn", authorHandle: "patio11" });
  const live = personFingerprint({ platform: "hn", authorHandle: "patio11" });
  assert.ok(corpus);
  assert.equal(corpus, live);
});

test("the display label would NOT have deduped — which is the bug this replaced", () => {
  const corpus = personFingerprint({ platform: "hn", authorHandle: "patio11" });
  const displayLabelled = personFingerprint({ platform: "Hacker News", authorHandle: "patio11" });
  assert.notEqual(corpus, displayLabelled);
});

test('"Forum" collapsed four unrelated networks into one identity space', () => {
  // Same handle, genuinely different people on Stack Exchange and Lemmy. Under the display label
  // both were `handle:forum:alice` — one person.
  const underDisplayLabel = [
    personFingerprint({ platform: "Forum", authorHandle: "alice" }),
    personFingerprint({ platform: "Forum", authorHandle: "alice" }),
  ];
  assert.equal(underDisplayLabel[0], underDisplayLabel[1]);

  const underNetworkId = [
    personFingerprint({ platform: "stackexchange", authorHandle: "alice" }),
    personFingerprint({ platform: "lemmy", authorHandle: "lemmy.world/alice" }),
  ];
  assert.notEqual(underNetworkId[0], underNetworkId[1]);
});

test("Bluesky is not X, even though both display as X", () => {
  const bluesky = personFingerprint({ platform: "bluesky", authorHandle: "@alice.bsky.social" });
  const x = personFingerprint({ platform: "x", authorHandle: "@alice.bsky.social" });
  assert.ok(bluesky && x);
  assert.notEqual(bluesky, x);
});

test("a Bluesky handle fingerprints the same with or without its leading @", () => {
  // The crawler stores the bare handle; the query-time source prefixes "@".
  const crawled = personFingerprint({ platform: "bluesky", authorHandle: "alice.bsky.social" });
  const searched = personFingerprint({ platform: "bluesky", authorHandle: "@alice.bsky.social" });
  assert.equal(crawled, searched);
});

// --- nothing is invented when a platform stays quiet ---

test("an unknown account age produces no tenure line at all, never '0 years'", () => {
  assert.equal(describeTenure({ platform: "hn" }), undefined);
  assert.equal(describeTenure({ platform: "hn", accountAgeDays: undefined }), undefined);
  assert.equal(describeTenure({ platform: "hn", accountAgeDays: -3 }), undefined);
});

test("tenure is phrased at the scale it is measured", () => {
  assert.equal(describeTenure({ platform: "hn", accountAgeDays: 1 }), "1 day on Hacker News");
  assert.equal(describeTenure({ platform: "bluesky", accountAgeDays: 45 }), "45 days on Bluesky");
  assert.equal(describeTenure({ platform: "lemmy", accountAgeDays: 200 }), "7 months on Lemmy");
  assert.equal(describeTenure({ platform: "stackexchange", accountAgeDays: 3650 }), "10 years on Stack Exchange");
});

test("a zero-day account is a real answer and is said as one", () => {
  // Distinct from "unknown" above. This is the whole reason accountAgeDays is left absent rather
  // than defaulted to 0 in lib/ingest/people.ts.
  assert.equal(describeTenure({ platform: "hn", accountAgeDays: 0 }), "0 days on Hacker News");
});

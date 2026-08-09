// Apollo company records.
//
// Domain normalisation is the whole risk surface of the pure half: getting it wrong does not throw,
// it just misses, and a miss gets CACHED as "Apollo has no record of this company". So the failure
// would be silent, persistent, and wrong. Hence the coverage.
//
// Run: node --test lib/search/__tests__/apollo.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeDomain, hasApolloKey, ApolloError } from "../../../.test-build/lib/enrich/apollo.js";

test("URLs, emails and bare hosts all reduce to the same domain", () => {
  for (const input of [
    "stripe.com",
    "www.stripe.com",
    "https://stripe.com",
    "https://www.stripe.com/pricing?ref=x#top",
    "http://stripe.com:8080/a/b",
    "jane@stripe.com",
    "  HTTPS://WWW.Stripe.com/  ",
    "stripe.com.",
  ]) {
    assert.equal(normalizeDomain(input), "stripe.com", input);
  }
});

test("multi-label domains keep every label", () => {
  assert.equal(normalizeDomain("https://shop.example.co.uk/cart"), "shop.example.co.uk");
  assert.equal(normalizeDomain("news.ycombinator.com"), "news.ycombinator.com");
});

test("things that are not domains return null rather than a bad lookup", () => {
  for (const input of ["", "   ", "localhost", "not a domain", "stripe", "@handle", "https://", "192.168.1.1:3000/x"]) {
    assert.equal(normalizeDomain(input), null, JSON.stringify(input));
  }
});

test("a bare IP is not treated as a domain", () => {
  // Numeric TLD fails the letters-only TLD rule, which is what keeps an IP out of the cache.
  assert.equal(normalizeDomain("192.168.1.1"), null);
});

test("hasApolloKey reflects the environment, and reads the lowercase name", () => {
  const saved = { a: process.env.apollo_one, b: process.env.APOLLO_API_KEY, c: process.env.APOLLO_ONE };
  delete process.env.apollo_one;
  delete process.env.APOLLO_API_KEY;
  delete process.env.APOLLO_ONE;
  assert.equal(hasApolloKey(), false);
  process.env.apollo_one = "test-key";
  assert.equal(hasApolloKey(), true);
  delete process.env.apollo_one;
  // The documented fallback still works, so a rename does not silently disable enrichment.
  process.env.APOLLO_API_KEY = "test-key";
  assert.equal(hasApolloKey(), true);
  for (const [k, v] of [["apollo_one", saved.a], ["APOLLO_API_KEY", saved.b], ["APOLLO_ONE", saved.c]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("a quota refusal is distinguishable from an ordinary failure", () => {
  // The store must never cache a 402/429 as 'no such company'; this flag is how it tells.
  assert.equal(new ApolloError("out of credits", 402, true).quota, true);
  assert.equal(new ApolloError("rate limited", 429, true).quota, true);
  assert.equal(new ApolloError("bad key", 401).quota, false);
  assert.equal(new ApolloError("boom").quota, false);
});

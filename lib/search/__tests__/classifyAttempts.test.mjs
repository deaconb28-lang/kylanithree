// What a failed classify batch is allowed to conclude about the documents in it.
//
// This is the bug that cost most of the corpus, so it gets tests.
//
// `classifyBacklog` charges every document in a failed batch an attempt, on the reasoning that a
// structured-output rejection is caused by one document's content and there is no way to tell
// which. Sound for a content failure. Completely wrong for anything else — and when the Anthropic
// balance ran out, every batch threw `400 "Your credit balance is too low"`, the catch charged 20
// documents an attempt, and the tick repeated it. Thousands of good documents burned all three
// attempts within minutes and dropped out of the backlog query for good. Production showed 10,364
// documents with 6,691 unclassified and batches returning 3 and 5 rows at a time: the queue was not
// slow, it was nearly empty, because almost everything in it had been condemned.
//
// The rule these tests pin down: an infrastructure failure never charges a document. Nothing about
// billing, auth, rate limits, capacity or the network is a statement about a post's text.
//
// Run: node --test lib/search/__tests__/classifyAttempts.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { isInfrastructureFailure } from "../../../.test-build/lib/ingest/pipeline.js";

/** An Anthropic SDK error carries `status`; the message is what the API returned. */
const apiError = (status, message) => Object.assign(new Error(message), { status });

test("the exact error that emptied the backlog is infrastructure", () => {
  // Verbatim from the Railway worker logs.
  const err = apiError(400, "Your credit balance is too low to access the Anthropic API.");
  assert.equal(isInfrastructureFailure(err), true);
});

test("auth, rate limits, capacity and upstream faults never charge a document", () => {
  for (const err of [
    apiError(401, "invalid x-api-key"),
    apiError(403, "forbidden"),
    apiError(404, "model not found"),
    apiError(408, "request timeout"),
    apiError(429, "rate_limit_error"),
    apiError(500, "internal server error"),
    apiError(529, "Overloaded"),
  ]) {
    assert.equal(isInfrastructureFailure(err), true, `${err.status} should be infrastructure`);
  }
});

test("network failures never charge a document", () => {
  for (const message of [
    "fetch failed",
    "The operation was aborted due to timeout",
    "connect ECONNREFUSED 1.2.3.4:443",
    "getaddrinfo ENOTFOUND api.anthropic.com",
    "socket hang up",
  ]) {
    assert.equal(isInfrastructureFailure(new Error(message)), true, message);
  }
});

test("a billing failure is caught by its message even without a status", () => {
  // Not every path through the SDK preserves `status`; the message is the backstop.
  assert.equal(isInfrastructureFailure(new Error("Your credit balance is too low")), true);
  assert.equal(isInfrastructureFailure(new Error("quota exceeded for this organization")), true);
});

test("a content failure DOES charge — the poison-document protection still works", () => {
  // This is the case the attempt counter exists for: one document the model cannot produce valid
  // structured output for, sitting at the head of an oldest-first queue forever.
  const err = apiError(400, "messages.0.content: invalid schema for tool output");
  assert.equal(isInfrastructureFailure(err), false);
});

test("an unrecognised error charges, rather than being assumed harmless", () => {
  // Deliberate asymmetry. Wrongly charging a document costs it three retries; wrongly exempting one
  // reintroduces the infinite-retry bug the counter was added to fix. The unknown case takes the
  // recoverable side.
  assert.equal(isInfrastructureFailure(new Error("something entirely unexpected")), false);
  assert.equal(isInfrastructureFailure(undefined), false);
  assert.equal(isInfrastructureFailure(null), false);
});

test("a 400 that mentions neither billing nor the network is treated as content", () => {
  assert.equal(isInfrastructureFailure(apiError(400, "invalid_request_error")), false);
});

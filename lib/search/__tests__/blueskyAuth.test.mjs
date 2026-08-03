// Credential shape checks for Bluesky.
//
// These exist because a 401 from `com.atproto.server.createSession` says only "no", and the first
// time real credentials were set in production the log was eleven 401s followed by nine 429s in
// four seconds — twenty standing queries each retrying the login on their own, with nothing caching
// the failure. Bluesky rate-limits failed logins hard, so a wrong value does not just fail, it
// risks locking the account out.
//
// Everything checked here is knowable WITHOUT the secret and without spending a login attempt.
// Nothing in this file ever prints a credential.
//
// Run: node --test lib/search/__tests__/blueskyAuth.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { blueskyCredentialProblems, hasBlueskyCredentials } from "../../../.test-build/lib/search/bluesky.js";

const set = (id, pw) => {
  if (id === undefined) delete process.env.BLUESKY_IDENTIFIER;
  else process.env.BLUESKY_IDENTIFIER = id;
  if (pw === undefined) delete process.env.BLUESKY_APP_PASSWORD;
  else process.env.BLUESKY_APP_PASSWORD = pw;
};

afterEach(() => set(undefined, undefined));

test("a correct handle and app password report no problems", () => {
  set("kylani.bsky.social", "abcd-efgh-ijkl-mnop");
  assert.deepEqual(blueskyCredentialProblems(), []);
  assert.equal(hasBlueskyCredentials(), true);
});

test("an email or a DID is also a valid identifier", () => {
  set("founder@example.com", "abcd-efgh-ijkl-mnop");
  assert.deepEqual(blueskyCredentialProblems(), []);
  set("did:plc:z72i7hdynmk6r22z27h6tvur", "abcd-efgh-ijkl-mnop");
  assert.deepEqual(blueskyCredentialProblems(), []);
});

test("a handle copied off a profile page with its @ is caught", () => {
  // The single most likely way to get this wrong: the profile shows "@name.bsky.social".
  set("@kylani.bsky.social", "abcd-efgh-ijkl-mnop");
  const problems = blueskyCredentialProblems();
  assert.equal(problems.length, 1);
  assert.match(problems[0], /starts with "@"/);
});

test("the account password used instead of an app password is caught", () => {
  set("kylani.bsky.social", "myRealPassword123!");
  const problems = blueskyCredentialProblems();
  assert.equal(problems.length, 1);
  assert.match(problems[0], /app password/i);
});

test("whitespace from a copy-paste is caught", () => {
  set("kylani.bsky.social\n", "abcd-efgh-ijkl-mnop");
  assert.ok(blueskyCredentialProblems().some((p) => /whitespace/.test(p)));
  set("kylani.bsky.social", " abcd-efgh-ijkl-mnop");
  assert.ok(blueskyCredentialProblems().some((p) => /whitespace/.test(p)));
});

test("an identifier that is neither handle, email nor DID is caught", () => {
  // A display name rather than a handle — no dot, no @, no did: prefix.
  set("kylani", "abcd-efgh-ijkl-mnop");
  assert.ok(blueskyCredentialProblems().some((p) => /does not look like a handle/.test(p)));
});

test("the length is reported but the value never is", () => {
  set("kylani", "abcd-efgh-ijkl-mnop");
  const joined = blueskyCredentialProblems().join(" ");
  assert.match(joined, /6 chars/);
  // The diagnostic must never leak the secret itself.
  assert.ok(!joined.includes("abcd-efgh-ijkl-mnop"));
});

test("several problems are all reported at once, not one per fix-and-redeploy cycle", () => {
  set("@kylani.bsky.social ", "hunter2");
  const problems = blueskyCredentialProblems();
  assert.ok(problems.length >= 3, `expected whitespace + @ + password problems, got ${problems.length}`);
});

test("app passwords are matched case-insensitively", () => {
  set("kylani.bsky.social", "ABCD-EFGH-IJKL-MNOP");
  assert.deepEqual(blueskyCredentialProblems(), []);
});

test("missing credentials are absent rather than malformed", () => {
  set(undefined, undefined);
  assert.equal(hasBlueskyCredentials(), false);
  // Nothing to complain about the shape of — the caller checks hasBlueskyCredentials first.
  assert.deepEqual(blueskyCredentialProblems(), []);
});

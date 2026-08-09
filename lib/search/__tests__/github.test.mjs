// GitHub issue ingestion: body cleaning and identity.
//
// Issue bodies are markdown written by engineers, so they arrive full of things that are not prose.
// That matters more here than on any other source, because THREE downstream stages read this text:
// the lexical gate decides whether the document is worth classifying, the classifier decides what
// the person needs, and the embedding decides what it is semantically near. An issue whose body is
// 3,000 characters of stack trace wrapped around one sentence of complaint gets judged on the stack
// trace by all three — and the embedding would encode the language of the error rather than the
// language of the need.
//
// Run: node --test lib/search/__tests__/github.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  issueBodyToText,
  repoFromUrl,
  githubToken,
  githubTokenProblem,
  GITHUB_STANDING_QUERIES,
} from "../../../.test-build/lib/ingest/sources/github.js";
import { personFingerprint } from "../../../.test-build/lib/credits/fingerprint.js";

test("fenced code blocks are removed but the prose around them survives", () => {
  const body = [
    "We keep hitting this when the nightly job runs:",
    "```js",
    "const x = require('thing');",
    "throw new Error('boom');",
    "```",
    "Honestly we are looking for a tool that just handles the retries for us.",
  ].join("\n");
  const text = issueBodyToText(body);
  assert.ok(!text.includes("require('thing')"), "code should be gone");
  assert.match(text, /nightly job runs/);
  assert.match(text, /looking for a tool that just handles the retries/);
});

test("issue-template HTML comments are removed", () => {
  // These are written by the repository maintainer, not the person filing. Leaving them in would
  // attribute a template's words to a human — the same fabrication problem in a new place.
  const body = "<!-- Please search existing issues before filing -->\nWe do this manually every week.";
  const text = issueBodyToText(body);
  assert.ok(!text.includes("search existing issues"));
  assert.match(text, /We do this manually every week/);
});

test("collapsed details sections, which are almost always logs, are removed", () => {
  const body = "It breaks nightly.\n<details><summary>Logs</summary>\n2026-01-01 ERROR at 0x00\n</details>\nAny recommendations for a tool?";
  const text = issueBodyToText(body);
  assert.ok(!text.includes("0x00"));
  assert.match(text, /Any recommendations for a tool/);
});

test("indented code blocks are removed", () => {
  const body = "Repro:\n\n    npm install\n    npm run build\n\nWe wish there was a way to skip this.";
  const text = issueBodyToText(body);
  assert.ok(!text.includes("npm run build"));
  assert.match(text, /wish there was a way/);
});

test("issue-template checklists are removed entirely", () => {
  // Straight off a real card: the template's own checklist was rendering AS the author's quote.
  const body = [
    "- [x] I have searched for an existing issue, and could not find anything.",
    "- [ ] I am willing to submit a PR",
    "We do this manually every release and it is painful.",
  ].join("\n");
  const text = issueBodyToText(body);
  assert.ok(!text.includes("searched for an existing issue"), `checklist survived: ${text}`);
  assert.ok(!text.includes("willing to submit"));
  assert.match(text, /We do this manually every release/);
});

test("heading markers go but the heading's words stay", () => {
  // A maintainer's "###" is scaffolding; the words after it can be the author's own.
  const text = issueBodyToText("### What problem is this feature going to solve?\nWe cannot track requests.");
  assert.ok(!text.includes("###"));
  assert.match(text, /What problem is this feature going to solve/);
  assert.match(text, /We cannot track requests/);
});

test("a body that is nothing but template scaffolding collapses to nothing", () => {
  // The crawler drops an empty body, which is correct — there is no statement of need in a form.
  const body = "- [x] I have searched for an existing issue\n- [ ] I read the contributing guide";
  assert.equal(issueBodyToText(body).replace(/\s+/g, ""), "");
});

test("inline backticks survive, because naming a tool is part of what they said", () => {
  const text = issueBodyToText("We use `cron` for this and it is a pain to maintain.");
  assert.match(text, /`cron`/);
  assert.match(text, /pain to maintain/);
});

test("an empty or absent body yields an empty string, never null", () => {
  assert.equal(issueBodyToText(undefined), "");
  assert.equal(issueBodyToText(null), "");
  assert.equal(issueBodyToText(""), "");
  // A body that is nothing BUT code collapses to empty, and the crawler drops it — correct, since
  // there is no statement of need in a bare stack trace.
  assert.equal(issueBodyToText("```\nboom\n```"), "");
});

test("the repo name is extracted from the API url for the venue label", () => {
  assert.equal(repoFromUrl("https://api.github.com/repos/tvanfossen/doxyguard-db"), "tvanfossen/doxyguard-db");
  assert.equal(repoFromUrl(undefined), undefined);
  assert.equal(repoFromUrl("https://api.github.com/nonsense"), undefined);
});

test("every standing query is a quoted phrase scoped to issue bodies", () => {
  // The failure this guards against has happened twice on Stack Exchange routing: a bare word like
  // "tool" matches most of the corpus and the wrongness is silent, because a bad query returns
  // plausible results rather than an error.
  for (const q of GITHUB_STANDING_QUERIES) {
    assert.match(q, /^"[^"]+"/, `${q} should start with a quoted phrase`);
    assert.match(q, /\bin:body\b/, `${q} should search bodies`);
    assert.match(q, /\bis:issue\b/, `${q} should exclude pull requests`);
  }
});

// --- the token is optional, and a bad one must not cost the source ---
//
// These exist because of a real failure, not a hypothetical. The sandbox that built this source has
// a 14-character GITHUB_TOKEN in its environment; sending it turned a search that answers 200
// unauthenticated into a hard 401. Absent costs throughput. Malformed cost the whole source.

const withToken = (value, fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, "GITHUB_TOKEN");
  const prev = process.env.GITHUB_TOKEN;
  if (value === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = value;
  try {
    fn();
  } finally {
    if (had) process.env.GITHUB_TOKEN = prev;
    else delete process.env.GITHUB_TOKEN;
  }
};

test("no token is not a problem — unauthenticated search genuinely works", () => {
  // This is the whole reason GitHub was chosen over Reddit, so it must never be treated as a fault.
  withToken(undefined, () => {
    assert.equal(githubTokenProblem(), null);
    assert.equal(githubToken(), null);
  });
});

test("a malformed token is reported and never sent", () => {
  withToken("ghp_short", () => {
    const problem = githubTokenProblem();
    assert.ok(problem, "a 9-char token should be rejected");
    assert.match(problem, /not shaped like a GitHub token/);
    assert.equal(githubToken(), null, "a malformed token must not be sent");
  });
});

test("the real sandbox value that caused a 401 is caught", () => {
  withToken("abcdefghijklmn", () => {
    assert.match(githubTokenProblem(), /14 chars/);
    assert.equal(githubToken(), null);
  });
});

test("the problem message reports the length but never the token", () => {
  withToken("not-a-real-token-value", () => {
    const problem = githubTokenProblem();
    assert.ok(!problem.includes("not-a-real-token-value"));
    assert.match(problem, /22 chars/);
  });
});

test("real token shapes are accepted and passed through", () => {
  for (const good of [
    `ghp_${"a".repeat(36)}`,
    `gho_${"b".repeat(36)}`,
    `github_pat_${"c".repeat(60)}`,
    "0".repeat(40), // legacy 40-char hex PAT
  ]) {
    withToken(good, () => {
      assert.equal(githubTokenProblem(), null, `${good.slice(0, 8)}… should be accepted`);
      assert.equal(githubToken(), good);
    });
  }
});

test("surrounding whitespace is trimmed rather than making a good token look malformed", () => {
  const good = `ghp_${"a".repeat(36)}`;
  withToken(`  ${good}\n`, () => {
    assert.equal(githubTokenProblem(), null);
    assert.equal(githubToken(), good);
  });
});

test("an empty string is treated as absent, not as malformed", () => {
  withToken("   ", () => {
    assert.equal(githubTokenProblem(), null);
    assert.equal(githubToken(), null);
  });
});

test("a GitHub login found live dedupes against the same login in the corpus", () => {
  // The crawler stores the bare login; searchGithub sends networkId "github" with the bare login.
  const corpus = personFingerprint({ platform: "github", authorHandle: "torvalds" });
  const live = personFingerprint({ platform: "github", authorHandle: "torvalds" });
  assert.ok(corpus);
  assert.equal(corpus, live);
});

test("GitHub does not collide with the other flat-namespace networks", () => {
  const github = personFingerprint({ platform: "github", authorHandle: "alice" });
  const reddit = personFingerprint({ platform: "reddit", authorHandle: "alice" });
  const hn = personFingerprint({ platform: "hn", authorHandle: "alice" });
  assert.equal(new Set([github, reddit, hn]).size, 3);
});

test('the display label "Forum" would have merged GitHub with three other networks', () => {
  // GitHub renders as "Forum", which is also Stack Exchange, Discourse and Lemmy. This is why
  // Candidate carries networkId and why nothing may fingerprint on platform.
  const asDisplayed = personFingerprint({ platform: "Forum", authorHandle: "alice" });
  const asNetwork = personFingerprint({ platform: "github", authorHandle: "alice" });
  assert.notEqual(asDisplayed, asNetwork);
});

// Marking the founder's matched phrases inside a lead's quote.
//
// This replaced a `matched "can't find first customers"` chip that sat on its own row of every lead
// card. With fourteen leads that was the same sentence fourteen times — a whole horizontal band per
// card spent restating what the summary above it already implied. Marking WHERE the match is says
// strictly more in strictly less space.
//
// The rule these tests exist to hold: the highlight and `matchedTerms` must agree by construction.
// They share a tokenizer and a stop-word set, so a phrase that counted as a match has its words
// marked, and a word that did not count is never marked. The failure mode without this is a card
// claiming a phrase matched with nothing marked in the text — or worse, a mark on a word that
// contributed nothing.
//
// Run: node --test lib/search/__tests__/highlight.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import { highlightRanges, highlightSegments, matchedTerms } from "../../../.test-build/lib/search/excerpt.js";

const marked = (text, phrases) =>
  highlightSegments(text, phrases)
    .filter((s) => s.marked)
    .map((s) => s.text);

test("the words of a matched phrase are marked where they appear", () => {
  const text = "I'm looking for advice on how to get our first customers and design partners.";
  assert.deepEqual(marked(text, ["can't find first customers"]), ["first customers"]);
});

test("adjacent words merge into one mark rather than two with a seam", () => {
  // "first" and "customers" are separate tokens; the rendered mark must be continuous.
  const segs = highlightSegments("get our first customers today", ["first customers"]);
  assert.equal(segs.filter((s) => s.marked).length, 1);
  assert.equal(segs.find((s) => s.marked).text, "first customers");
});

test("a substring inside a longer word is never marked", () => {
  // The bug this guards is the one that routed software products to the Pets Stack Exchange:
  // "cat" living inside "scattered". indexOf would mark it; walking real tokens does not.
  assert.deepEqual(marked("we have scattered feature requests", ["cat"]), []);
  assert.deepEqual(marked("communication is hard", ["cat"]), []);
});

test("inflections mark exactly as far as the keyword router allows, and no further", () => {
  // seSites.ts routes with `\\b<keyword>(?:s|es|ing|ed)?\\b` — suffixes are allowed ON the keyword.
  // So the tolerance is asymmetric, and the highlighter must not invent a looser stemmer than the
  // rule the rest of the product matches by.
  assert.deepEqual(marked("get our first customers today", ["first customer"]), ["first customers"]);
  assert.deepEqual(marked("she struggles with this", ["struggle"]), ["struggles"]);
  // Two things that are NOT matches anywhere in this codebase, so must not be marked here either.
  // The suffix goes on the keyword, so "struggle" reaches "struggles" but never "struggled" —
  // that would require dropping the keyword's own "e", which no rule in this product does.
  assert.deepEqual(marked("she struggled with this", ["struggle"]), []);
  assert.deepEqual(marked("finding our first customer", ["customers"]), []);
});

test("stop words and short words are never marked on their own", () => {
  // "can't", "find" — "find" is 4 chars and not ignored, so it marks; "the"/"you" must not.
  assert.deepEqual(marked("what do you get from the thing", ["what do you get"]), []);
});

test("nothing matched means nothing marked, and the whole text comes back intact", () => {
  const text = "A completely unrelated sentence about lakehouse tables.";
  assert.deepEqual(highlightRanges(text, ["can't find first customers"]), []);
  assert.deepEqual(highlightSegments(text, []), [{ text, marked: false }]);
  assert.deepEqual(highlightSegments(text, ["nope"]), [{ text, marked: false }]);
});

test("segments always reassemble to exactly the original text", () => {
  // The card renders these in order, so any dropped or duplicated character is a visible corruption
  // of somebody's actual words — which is the one thing a quote may never be.
  for (const [text, phrases] of [
    ["get our first customers and design partners", ["first customers"]],
    ["customers customers customers", ["customers"]],
    ["first", ["first"]],
    ["", ["first"]],
    ["nothing to see", ["absent"]],
    ["  leading and trailing  ", ["leading"]],
  ]) {
    const rebuilt = highlightSegments(text, phrases).map((s) => s.text).join("");
    assert.equal(rebuilt, text, `"${text}" did not survive a round trip`);
  }
});

test("ranges are sorted, non-overlapping and within bounds", () => {
  const text = "first customers, early customers, and more customers besides";
  const ranges = highlightRanges(text, ["first customers", "early customers"]);
  let previousEnd = -1;
  for (const [start, end] of ranges) {
    assert.ok(start >= 0 && end <= text.length, `[${start},${end}) out of bounds`);
    assert.ok(start < end, "empty range");
    assert.ok(start > previousEnd, "ranges overlap or are unsorted");
    previousEnd = end;
  }
});

test("small words between matched ones are bridged into one region", () => {
  // Rendered first as "First"/"Customers" with an unmarked "Ten" in the hole, and "cold outreach"
  // "not" "working" as three separate stabs. The founder's phrase is the unit they care about.
  assert.deepEqual(marked("Advice for First Ten Customers here", ["first customers"]), ["First Ten Customers"]);
  assert.deepEqual(marked("cold outreach not working at all", ["cold outreach not working"]), ["cold outreach not working"]);
});

test("a bridge never crosses sentence punctuation", () => {
  // A gap containing "." or "," is a different thought, however short — without this the mark runs
  // from one sentence into the next and swallows everything between two distant hits.
  const out = marked("we need customers. Honestly, customers are hard", ["customers"]);
  assert.equal(out.length, 2, `expected two separate marks, got ${JSON.stringify(out)}`);
});

test("a long gap is not bridged", () => {
  const out = marked("customers are what we spend every single day worrying about and users too", ["customers", "users"]);
  assert.equal(out.length, 2);
});

test("two phrases sharing a word produce one mark, not two abutting ones", () => {
  const segs = highlightSegments("our first customers", ["first customers", "early customers"]);
  assert.equal(segs.filter((s) => s.marked).length, 1);
});

// --- the agreement that matters ---

test("a phrase matchedTerms accepted has something to mark in the same text", () => {
  // If these two ever disagree the card claims a match it cannot show, which is the failure the
  // shared tokenizer exists to make impossible.
  const text = "I'm looking for advice on how to get our first customers and design partners";
  const keywords = ["can't find first customers", "struggling to get first users", "tried ads no signups"];
  for (const phrase of matchedTerms(text, keywords)) {
    assert.ok(
      highlightRanges(text, [phrase]).length > 0,
      `matchedTerms accepted "${phrase}" but nothing could be marked`,
    );
  }
});

test("a phrase matchedTerms rejected is not silently marked anyway", () => {
  // "alternative" alone must not match a two-word phrase — the length-aware threshold — and the
  // highlighter must not imply it did.
  const text = "is there an alternative approach to this problem";
  assert.deepEqual(matchedTerms(text, ["linear alternative"]), []);
});

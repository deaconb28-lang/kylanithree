import test from "node:test";
import assert from "node:assert/strict";

import { laymanSummary } from "../../../.test-build/lib/search/excerpt.js";

// These inputs are REAL classifier output, captured from a production run against plausible.io —
// not invented examples chosen to make the function look good. If a case here reads badly, that is
// what a founder is currently seeing on a card.

test("a summary that already reads well is left alone", () => {
  const s = "Wants a privacy-focused replacement for Google Analytics on a side project.";
  // The trailing full stop goes: these are labels on a card, not prose.
  assert.equal(laymanSummary(s), "Wants a privacy-focused replacement for Google Analytics on a side project");
});

test("the classifier talking about 'the author' loses the preamble", () => {
  // Four words spent saying nothing — the card shows whose words these are directly underneath.
  assert.equal(
    laymanSummary("The author needs a way to track profitability across channels"),
    "Needs a way to track profitability across channels",
  );
  assert.equal(laymanSummary("The user is looking for a GDPR-safe analytics tool"), "Looking for a GDPR-safe analytics tool");
  assert.equal(laymanSummary("OP wants to stop paying for two tools"), "Wants to stop paying for two tools");
});

test("a long summary is cut at a clause, never mid-thought", () => {
  const real = "Needs a replacement for a discontinued scroll/engagement tracking plugin now that GA4's engagement metrics fall short.";
  const out = laymanSummary(real);
  assert.equal(out, "Needs a replacement for a discontinued scroll/engagement tracking plugin");
  // The specific failure this prevents: a sentence stopped mid-word reads as a rendering bug.
  assert.ok(!out.endsWith("…"), "must not trail an ellipsis when a clause boundary exists");
  assert.ok(out.length <= 92);
});

test("it takes the LONGEST complete thought that fits, not the first break", () => {
  const s =
    "Loses traffic data, which matters to them, because cookie consent banners block the analytics script on most European sites";
  const out = laymanSummary(s);
  // Three boundaries fit under the cap — ", " twice and " because ". The longest one wins, because
  // the goal is the fullest complete thought that fits rather than the shortest.
  assert.equal(out, "Loses traffic data, which matters to them");
  assert.ok(out.length <= 92);
});

test("only the first sentence survives", () => {
  const s = "Their visitor numbers are stuck. The figures disagree with Google. They want help.";
  assert.equal(laymanSummary(s), "Their visitor numbers are stuck");
});

test("a question keeps its question mark", () => {
  assert.equal(laymanSummary("What do people use instead of Google Analytics?"), "What do people use instead of Google Analytics?");
});

test("nothing usable returns nothing, never a stub", () => {
  // A card with no summary renders the quote instead. A three-character summary renders as a bug.
  assert.equal(laymanSummary(undefined), undefined);
  assert.equal(laymanSummary(null), undefined);
  assert.equal(laymanSummary(""), undefined);
  assert.equal(laymanSummary("   "), undefined);
  assert.equal(laymanSummary("N/A"), undefined);
  assert.equal(laymanSummary("The author"), undefined, "a summary that is only a preamble has no content");
});

test("no summary ever exceeds the cap", () => {
  const long =
    "The author requires a comprehensive mechanism whereby telemetry originating from distributed edge nodes may be aggregated centrally and subsequently normalised for downstream consumption by analytics tooling";
  const out = laymanSummary(long);
  assert.ok(out.length <= 92, `got ${out.length}: ${out}`);
  assert.ok(!/^the author/i.test(out));
});

test("the cap is honoured at a custom width too", () => {
  const s = "Wants a privacy-focused replacement for Google Analytics on a side project";
  assert.ok((laymanSummary(s, 40) ?? "").length <= 40);
});

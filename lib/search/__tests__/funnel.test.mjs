import test from "node:test";
import assert from "node:assert/strict";

import { buildFunnel, formatRate, formatDelta, daysToConvert } from "../../../.test-build/lib/campaign/funnel.js";
import { stageOf, STAGES } from "../../../.test-build/lib/campaign/types.js";

// The spine, the stage workspaces and the cohort table all read from `buildFunnel`, so these tests
// are what hold the acceptance criterion "spine counts, deltas and conversion rates agree with the
// cohort table". The failure they exist to prevent is the quiet one: two individually-correct
// queries that disagree by exactly the people who have moved on.

const NOW = Date.parse("2026-08-04T12:00:00Z");
const day = (n) => new Date(NOW - n * 86_400_000);

/** A lead that reached `status` `movedDaysAgo` ago, first seen `seenDaysAgo` ago. */
const lead = (status, movedDaysAgo = 1, seenDaysAgo = movedDaysAgo) => ({
  status,
  firstSeenAt: day(seenDaysAgo),
  updatedAt: day(movedDaysAgo),
});

test("the funnel is cumulative — a person who replied is counted at every stage they passed", () => {
  const f = buildFunnel([lead("replied")], NOW);
  const by = Object.fromEntries(f.stages.map((s) => [s.key, s.count]));
  assert.deepEqual(by, { found: 1, engaged: 1, in_conversation: 1, converted: 0 });
});

test("counts only ever descend", () => {
  const f = buildFunnel(
    [
      ...Array.from({ length: 40 }, () => lead("waiting")),
      ...Array.from({ length: 20 }, () => lead("sent")),
      ...Array.from({ length: 8 }, () => lead("replied")),
      ...Array.from({ length: 3 }, () => lead("converted")),
    ],
    NOW,
  );
  const counts = f.stages.map((s) => s.count);
  assert.deepEqual(counts, [71, 31, 11, 3]);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] <= counts[i - 1], `${STAGES[i]} must not exceed ${STAGES[i - 1]}`);
  }
  assert.equal(f.total, 71, "total is everyone still in the funnel");
});

test("a dropped person leaves the funnel entirely rather than padding the top", () => {
  // "Not a fit" is an explicit removal. Counting those under Found would make the top of the funnel
  // a number that can only grow, which is the definition of a vanity metric.
  const f = buildFunnel([lead("waiting"), lead("dropped"), lead("dropped")], NOW);
  assert.equal(f.stages[0].count, 1);
  assert.equal(f.total, 1);
  assert.equal(stageOf("dropped"), null);
  // But they are still history: the account has run, so this is not a never-run state.
  assert.equal(f.neverRun, false);
});

test("an approved draft is not an engagement", () => {
  // `approved` means the founder signed off on a draft. Nothing has reached the person, and counting
  // it as Engaged would claim a touch that never happened.
  assert.equal(stageOf("approved"), "found");
  const f = buildFunnel([lead("approved")], NOW);
  assert.equal(f.stages[0].count, 1);
  assert.equal(f.stages[1].count, 0);
});

test("a rate against an empty stage is omitted, never rendered as 0%", () => {
  const f = buildFunnel([], NOW);
  for (const s of f.stages) assert.equal(s.rateFromPrevious, null);
  assert.equal(formatRate(null), null, "null must render nothing at all");
  // The first node has nothing before it, so it can never carry a rate.
  const seeded = buildFunnel([lead("converted")], NOW);
  assert.equal(seeded.stages[0].rateFromPrevious, null);
});

test("conversion rates are stage-over-previous-stage", () => {
  const f = buildFunnel(
    [
      ...Array.from({ length: 74 }, () => lead("waiting")),
      ...Array.from({ length: 35 }, () => lead("sent")),
      ...Array.from({ length: 13 }, () => lead("replied")),
      ...Array.from({ length: 6 }, () => lead("converted")),
    ],
    NOW,
  );
  const [found, engaged, conv, converted] = f.stages;
  assert.equal(found.count, 128);
  assert.equal(engaged.count, 54);
  assert.equal(conv.count, 19);
  assert.equal(converted.count, 6);
  assert.equal(formatRate(engaged.rateFromPrevious), "42%");
  assert.equal(formatRate(conv.rateFromPrevious), "35%");
  assert.equal(formatRate(converted.rateFromPrevious), "32%");
});

test("a brand-new account reports no delta rather than +0", () => {
  const f = buildFunnel([], NOW);
  assert.equal(f.neverRun, true);
  for (const s of f.stages) assert.equal(s.delta, null, "+0 this week is a measurement nobody took");
  assert.equal(formatDelta(null), null);
});

test("a real quiet week reports +0, because zero is a real week", () => {
  const f = buildFunnel([lead("sent", 30, 40)], NOW);
  assert.equal(f.neverRun, false);
  assert.equal(f.stages[1].delta, 0);
  assert.equal(formatDelta(0), "+0 this wk");
});

test("the delta counts arrivals in the trailing week, at the stage they reached", () => {
  const f = buildFunnel(
    [
      lead("waiting", 2, 2), // found this week
      lead("waiting", 2, 30), // found a month ago; touched since, but not a new arrival
      lead("replied", 3, 40), // moved into conversation this week
      lead("replied", 20, 40), // moved a fortnight ago
    ],
    NOW,
  );
  const by = Object.fromEntries(f.stages.map((s) => [s.key, s.delta]));
  // Found is dated by FIRST SIGHTING, not updatedAt — an enrichment pass touching an old row must
  // not read as a new person arriving.
  assert.equal(by.found, 1);
  assert.equal(by.in_conversation, 1);
  assert.equal(by.converted, 0);
});

test("days to convert floors at zero and rejects impossible ordering", () => {
  assert.equal(daysToConvert(day(10), day(3)), 7);
  // Found and converted the same afternoon is zero days, not one.
  assert.equal(daysToConvert(day(3), day(3)), 0);
  assert.equal(daysToConvert("2026-08-01T09:00:00Z", "2026-08-01T23:00:00Z"), 0);
  // Converted before found is not a duration, it is bad data.
  assert.equal(daysToConvert(day(1), day(9)), null);
  assert.equal(daysToConvert("nonsense", day(1)), null);
});

test("every status maps to a stage or to nothing, with no silent default", () => {
  const statuses = ["waiting", "approved", "dropped", "sent", "replied", "converted"];
  for (const s of statuses) {
    const stage = stageOf(s);
    assert.ok(stage === null || STAGES.includes(stage), `${s} produced ${stage}`);
  }
});

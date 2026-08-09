// How confident the product is allowed to sound about a buyer hypothesis.
//
// This replaced a stored `status` field someone assigned by hand. `primary` rendered as "gaining" —
// a word that claims replies are coming back — and a hypothesis with zero leads read identically to
// one with forty, because the label was written when the hypothesis was rather than earned by
// anything that happened afterwards.
//
// The constraint the whole file exists to hold: nothing in this product can send yet. The Gmail
// scope is `openid email profile` pending Google's verification, so `contacted`, `replied` and
// `booked` are structurally zero for every hypothesis. Any formula weighted on reply rate returns
// the same number for everyone and presents it as a measurement. These tests pin that "gaining" is
// UNREACHABLE from today's data, and that an untested buyer scores null rather than zero.
//
// Run: node --test lib/search/__tests__/buyerConfidence.test.mjs   (after `npx tsc -p tsconfig.test.json`)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buyerConfidence,
  MIN_CONTACTED_FOR_RATE,
  MIN_SHOWN_FOR_REJECTION_RATE,
} from "../../../.test-build/lib/buyers/confidence.js";

const evidence = (over = {}) => ({ leadsShown: 0, rejections: 0, contacted: 0, replied: 0, booked: 0, ...over });

test("a buyer nobody matched scores null, not zero", () => {
  // Zero is a measurement meaning "we tried and it failed". Null means "nothing has been tried".
  // Collapsing them puts a confident-looking 0 beside an untested buyer.
  const c = buyerConfidence(evidence());
  assert.equal(c.score, null);
  assert.equal(c.status, "unproven");
  assert.match(c.reason, /No one matched/);
});

test("today's real state — leads found, nothing sent — says nothing is proven", () => {
  const c = buyerConfidence(evidence({ leadsShown: 12 }));
  assert.equal(c.status, "finding");
  assert.equal(c.score, null, "no score is claimable with nothing sent");
  assert.match(c.reason, /Nothing sent yet, so nothing is proven/);
});

test('"gaining" cannot be reached without replies, which cannot happen until Gmail is verified', () => {
  // The specific regression this guards: the old card showed "gaining" for any hypothesis marked
  // primary, with literally no replies behind it anywhere in the system.
  for (const shown of [1, 10, 100]) {
    for (const rejected of [0, 1, 5]) {
      const c = buyerConfidence(evidence({ leadsShown: shown, rejections: Math.min(rejected, shown) }));
      assert.notEqual(c.status, "gaining", `${shown} shown / ${rejected} rejected must not read as gaining`);
    }
  }
});

test("rejections are the one verdict available today, and they are reported", () => {
  // More than half rejected, over the minimum sample.
  const c = buyerConfidence(evidence({ leadsShown: 8, rejections: 5 }));
  assert.equal(c.status, "disconfirmed");
  assert.match(c.reason, /You rejected 5 of 8/);
  assert.ok(typeof c.score === "number" && c.score < 50, "disconfirmation should score below neutral");
});

test("a couple of rejections in a small sample is not a verdict", () => {
  // Below MIN_SHOWN_FOR_REJECTION_RATE the denominator is too small to divide by — the same
  // reasoning that removed the reply-rate tile for 1 contact and 0 replies.
  const c = buyerConfidence(evidence({ leadsShown: MIN_SHOWN_FOR_REJECTION_RATE - 1, rejections: 2 }));
  assert.equal(c.status, "finding");
  assert.equal(c.score, null);
});

test("a reply rate is not computed until the denominator can carry one", () => {
  const justBelow = buyerConfidence(evidence({ leadsShown: 20, contacted: MIN_CONTACTED_FOR_RATE - 1, replied: 0 }));
  assert.equal(justBelow.status, "finding", "4 contacted and 0 replies is not 0%, it is unknown");
  assert.equal(justBelow.score, null);
});

test("once enough have been contacted, silence is reported as silence rather than as failure", () => {
  const c = buyerConfidence(evidence({ leadsShown: 20, contacted: 10, replied: 0 }));
  assert.equal(c.status, "unproven");
  assert.match(c.reason, /10 contacted, nothing back yet/);
  assert.equal(typeof c.score, "number");
});

test("replies, when they can finally happen, produce gaining and a real score", () => {
  // Unreachable in production today. Implemented so the day the Gmail scope is approved this works
  // without anyone having to remember it was stubbed.
  const c = buyerConfidence(evidence({ leadsShown: 30, contacted: 10, replied: 3 }));
  assert.equal(c.status, "gaining");
  assert.match(c.reason, /3 replies from 10 contacted/);
  assert.ok(c.score > 50, "replies should score above neutral");
});

test("one reply is singular, three are plural", () => {
  assert.match(buyerConfidence(evidence({ leadsShown: 30, contacted: 10, replied: 1 })).reason, /1 reply from/);
  assert.match(buyerConfidence(evidence({ leadsShown: 30, contacted: 10, replied: 2 })).reason, /2 replies from/);
});

test("bookings count for more than replies alone", () => {
  const repliesOnly = buyerConfidence(evidence({ leadsShown: 30, contacted: 10, replied: 3 }));
  const withBookings = buyerConfidence(evidence({ leadsShown: 30, contacted: 10, replied: 3, booked: 2 }));
  assert.ok(withBookings.score > repliesOnly.score);
});

test("the score is bounded to 0-100 at both ends", () => {
  const awful = buyerConfidence(evidence({ leadsShown: 100, rejections: 100 }));
  assert.ok(awful.score >= 0, `got ${awful.score}`);
  const perfect = buyerConfidence(evidence({ leadsShown: 100, contacted: 100, replied: 100, booked: 100 }));
  assert.ok(perfect.score <= 100, `got ${perfect.score}`);
});

test("a retired buyer reports retired and claims no score", () => {
  const c = buyerConfidence(evidence({ leadsShown: 40, contacted: 10, replied: 4 }), { retired: true });
  assert.equal(c.status, "retired");
  assert.equal(c.score, null);
  assert.match(c.reason, /not being searched for/);
});

test("every reason states evidence, never a bare adjective", () => {
  // A status on its own is an assertion; the reason has to be checkable against the queue.
  for (const e of [
    evidence(),
    evidence({ leadsShown: 12 }),
    evidence({ leadsShown: 8, rejections: 5 }),
    evidence({ leadsShown: 20, contacted: 10, replied: 0 }),
    evidence({ leadsShown: 30, contacted: 10, replied: 3 }),
  ]) {
    const { reason } = buyerConfidence(e);
    assert.ok(reason.length > 0);
    assert.ok(/\d|No one/.test(reason), `"${reason}" should cite a count`);
  }
});

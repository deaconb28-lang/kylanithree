import test from "node:test";
import assert from "node:assert/strict";

import { PLAN, formattedPrice, isPlan, isLegacyPlan, DAILY_CAP_MAX } from "../../../.test-build/lib/billing.js";
import {
  referralCodeFor,
  referralLink,
  isValidReferralCode,
  recordReferral,
  REFERRAL_REWARD_CENTS,
} from "../../../.test-build/lib/referrals.js";
import {
  stripeKeySource,
  stripeKeyShape,
  stripeMode,
  checkoutConfigured,
  billingConfigured,
} from "../../../.test-build/lib/stripe.js";

// Billing and referrals are the two places in this product where a bug costs real money rather than
// a bad search result, so the invariants that keep the displayed price, the charged price and the
// credit in agreement are pinned here rather than left to review.

test("the displayed price is derived from the cents that are charged", () => {
  // The old page hardcoded "$89" as a string next to Payment Links whose amounts nobody could see.
  // This asserts the formatting of the SAME constant the Stripe price is created from — if
  // amountCents moves and the string does not, that is the drift this test exists to catch.
  assert.equal(formattedPrice(), "$49.99");
  assert.equal(PLAN.amountCents, 4999);
  assert.equal(PLAN.currency, "usd");
  assert.equal(PLAN.interval, "month");
});

test("the lookup key encodes the amount, so a price change cannot reuse it", () => {
  // A Stripe Price is immutable. Reusing a lookup key for a new amount would resolve to the OLD
  // price and silently keep charging it, which is the exact failure `resolvePriceId` is built to
  // make impossible — but only while the key actually carries the number.
  assert.match(PLAN.lookupKey, new RegExp(`${PLAN.amountCents}$`));
});

test("legacy plans stay readable and are never confused with the plan on sale", () => {
  // A subscriber on the retired Founder tier is still being billed. Treating their plan string as
  // unknown would lock a paying customer out of the product.
  for (const p of ["kylani", "pro", "founder"]) assert.equal(isPlan(p), true);
  assert.equal(isPlan("studio"), false);
  assert.equal(isPlan(undefined), false);
  assert.equal(isLegacyPlan("founder"), true);
  assert.equal(isLegacyPlan("kylani"), false);
  // A pricing change must not quietly cut the ceiling somebody already paid for.
  assert.equal(DAILY_CAP_MAX.founder, 150);
  assert.equal(DAILY_CAP_MAX.kylani, 150);
});

test("a referral code is stable, opaque and does not leak the user id", () => {
  const id = "6650f2b1c9d4e8a70b3f1a2c";
  assert.equal(referralCodeFor(id), referralCodeFor(id));
  assert.match(referralCodeFor(id), /^[0-9a-f]{8}$/);
  assert.notEqual(referralCodeFor(id), referralCodeFor("6650f2b1c9d4e8a70b3f1a2d"));
  // The point of hashing: a raw user id in a shared URL is an internal identifier in public, and
  // an enumerable one.
  assert.ok(!referralCodeFor(id).includes(id.slice(0, 8)));
});

test("the referral link survives an origin with a trailing slash", () => {
  const id = "user-1";
  const code = referralCodeFor(id);
  assert.equal(referralLink("https://www.kylani.app", id), `https://www.kylani.app/?r=${code}`);
  assert.equal(referralLink("https://www.kylani.app/", id), `https://www.kylani.app/?r=${code}`);
});

test("only 8-char lowercase hex is ever treated as a code", () => {
  assert.equal(isValidReferralCode("0123abcd"), true);
  assert.equal(isValidReferralCode("0123ABCD"), false, "uppercase is not what referralCodeFor emits");
  assert.equal(isValidReferralCode("0123abc"), false);
  assert.equal(isValidReferralCode("0123abcde"), false);
  assert.equal(isValidReferralCode("0123abcg"), false);
  assert.equal(isValidReferralCode(""), false);
  assert.equal(isValidReferralCode(null), false);
  assert.equal(isValidReferralCode(undefined), false);
  // Anything that is not a code never reaches a query.
  assert.equal(isValidReferralCode({ $ne: null }), false);
});

test("referring yourself is refused before anything is written", async () => {
  // A free month for the cost of a second browser. The check runs ahead of the database on purpose,
  // so the refusal does not depend on a connection.
  const me = "user-self";
  const result = await recordReferral({
    code: referralCodeFor(me),
    referredUserId: me,
    resolveCodeToUserId: async () => me,
  });
  assert.equal(result, "self_referral");
});

test("a malformed code never reaches the resolver", async () => {
  let called = false;
  const result = await recordReferral({
    code: "not-a-code",
    referredUserId: "user-2",
    resolveCodeToUserId: async () => {
      called = true;
      return "user-1";
    },
  });
  assert.equal(result, "unknown_code");
  assert.equal(called, false);
});

test("a well-formed code nobody owns is a refusal, not an error", async () => {
  // Someone pastes a link with a typo. That must not fail their signup, and it must not attribute
  // them to whoever happens to hash nearby.
  const result = await recordReferral({
    code: "deadbeef",
    referredUserId: "user-2",
    resolveCodeToUserId: async () => null,
  });
  assert.equal(result, "unknown_code");
});

test("the referral reward is one month at the price actually charged", () => {
  assert.equal(REFERRAL_REWARD_CENTS, PLAN.amountCents);
});

// --- the Stripe key: which variable, and what is actually in it ------------------------------
//
// Two separate failures, both silent. The variable NAME was wrong on the deployments (the code read
// STRIPE_SECRET_KEY, Railway and Vercel have STRIPE_API_KEY), and a name tells you nothing about the
// value — a publishable key pasted into either one authenticates no call at all.

const stripeEnv = { ...process.env };
function withEnv(vars, fn) {
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_API_KEY"]) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_API_KEY"]) {
      if (stripeEnv[k] === undefined) delete process.env[k];
      else process.env[k] = stripeEnv[k];
    }
  }
}

test("the key is read under both names, with STRIPE_SECRET_KEY winning", () => {
  withEnv({ STRIPE_API_KEY: "sk_test_only_this_one" }, () => {
    assert.equal(stripeKeySource(), "STRIPE_API_KEY");
  });
  withEnv({ STRIPE_SECRET_KEY: "sk_test_explicit", STRIPE_API_KEY: "sk_test_fallback" }, () => {
    assert.equal(stripeKeySource(), "STRIPE_SECRET_KEY", "an explicit value must win over the fallback");
  });
  withEnv({}, () => assert.equal(stripeKeySource(), null));
});

test("a publishable key is never mistaken for a working configuration", () => {
  // The bug this pins: the first version returned "test" for anything not starting with sk_live_,
  // so a pk_ key — public, browser-side, authenticates nothing — read as a healthy test setup and
  // only failed when a founder clicked Subscribe.
  withEnv({ STRIPE_API_KEY: "pk_live_51abcdef" }, () => {
    assert.equal(stripeKeyShape(), "publishable");
    assert.notEqual(stripeMode(), "test", "a publishable key must not report as a test configuration");
    assert.equal(stripeMode(), "unknown");
  });
  withEnv({ STRIPE_API_KEY: "whsec_not_a_key_at_all" }, () => {
    assert.equal(stripeKeyShape(), "unrecognised");
    assert.equal(stripeMode(), "unknown");
  });
});

test("live and test are told apart for both secret and restricted keys", () => {
  withEnv({ STRIPE_SECRET_KEY: "sk_live_51abc" }, () => {
    assert.equal(stripeKeyShape(), "secret");
    assert.equal(stripeMode(), "live");
  });
  withEnv({ STRIPE_SECRET_KEY: "sk_test_51abc" }, () => {
    assert.equal(stripeKeyShape(), "secret");
    assert.equal(stripeMode(), "test");
  });
  // Restricted keys are legitimate here, and a live restricted key charges a real card.
  withEnv({ STRIPE_SECRET_KEY: "rk_live_51abc" }, () => {
    assert.equal(stripeKeyShape(), "restricted");
    assert.equal(stripeMode(), "live");
  });
  withEnv({}, () => {
    assert.equal(stripeKeyShape(), null);
    assert.equal(stripeMode(), "unset");
  });
});

test("selling requires the webhook secret, not just a key", () => {
  // Checkout alone charges the card. The webhook is what writes the subscription back, so without
  // it a customer pays and stays locked out — the failure worth refusing to ship into.
  const hadWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  withEnv({ STRIPE_API_KEY: "sk_test_51abc" }, () => {
    assert.equal(checkoutConfigured(), true);
    assert.equal(billingConfigured(), false, "a key without a webhook secret must not count as ready to sell");
  });
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  withEnv({ STRIPE_API_KEY: "sk_test_51abc" }, () => {
    assert.equal(billingConfigured(), true);
  });
  if (hadWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = hadWebhook;
});

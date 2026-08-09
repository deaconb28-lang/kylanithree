import Stripe from "stripe";

// THE KEY IS READ UNDER TWO NAMES, and that is not defensive padding — it is a mismatch that was
// already live. This file read `STRIPE_SECRET_KEY`; the variable actually set on the deployments is
// `STRIPE_API_KEY`. Nothing would have thrown: the client falls back to a placeholder string and
// every call fails with an authentication error naming neither variable. Same shape as `apollo_one`
// being lowercase — a rename silently disabling a whole subsystem.
//
// `STRIPE_SECRET_KEY` is checked first so an explicit value always wins.
function secretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || undefined;
}

/** Which variable the key actually came from, for `/api/health`. Never the value. */
export function stripeKeySource(): "STRIPE_SECRET_KEY" | "STRIPE_API_KEY" | null {
  if (process.env.STRIPE_SECRET_KEY) return "STRIPE_SECRET_KEY";
  if (process.env.STRIPE_API_KEY) return "STRIPE_API_KEY";
  return null;
}

export const stripe = new Stripe(secretKey() || "sk_test_placeholder");

/**
 * What KIND of key is set, from its prefix alone — never the value.
 *
 * This exists because "not a live key" and "a test key" are different facts, and the first version
 * of `stripeMode()` conflated them: anything not starting with `sk_live_` was reported as "test",
 * so a pasted PUBLISHABLE key (`pk_…`) — which is public, belongs in the browser, and cannot
 * authenticate a single API call — read as a perfectly healthy test configuration. The failure
 * would only surface as an authentication error at the moment a founder clicked Subscribe.
 *
 * Restricted keys (`rk_…`) are recognised because they are legitimate here, provided they carry
 * write access to Checkout Sessions, Prices, Coupons and Customers.
 */
export type StripeKeyShape = "secret" | "restricted" | "publishable" | "unrecognised" | null;

export function stripeKeyShape(): StripeKeyShape {
  const key = secretKey();
  if (!key) return null;
  if (/^sk_(live|test)_/.test(key)) return "secret";
  if (/^rk_(live|test)_/.test(key)) return "restricted";
  if (/^pk_/.test(key)) return "publishable";
  return "unrecognised";
}

/**
 * Live vs test, from the key's own prefix. Worth surfacing before anyone charges a real card.
 *
 * Returns "unknown" rather than guessing when the prefix is not one Stripe issues — see
 * `stripeKeyShape()`. Claiming "test" for a key that is not a key at all is the reassurance that
 * hid the problem.
 */
export function stripeMode(): "live" | "test" | "unknown" | "unset" {
  const key = secretKey();
  if (!key) return "unset";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "unknown";
}

/**
 * Does the key actually authenticate? Free, read-only, and opt-in behind `?stripe=probe`.
 *
 * `balance.retrieve()` is the cheapest question that requires a working secret key: it creates
 * nothing, charges nothing, and its `livemode` flag comes from STRIPE rather than from our own
 * prefix parsing — which is the only way to be sure the key is what the prefix claims.
 *
 * Kept out of the default health payload because uptime monitors hit that endpoint constantly and
 * this makes a real API call each time.
 */
export async function stripeProbe(): Promise<{
  ok: boolean;
  livemode?: boolean;
  currencies?: string[];
  error?: string;
  errorType?: string;
}> {
  if (!secretKey()) return { ok: false, error: "No Stripe key is set." };
  try {
    const balance = await stripe.balance.retrieve();
    return {
      ok: true,
      livemode: balance.livemode,
      currencies: balance.available.map((b) => b.currency),
    };
  } catch (err) {
    // The message is safe to surface here: it is Stripe's own description of why the key was
    // refused, it never contains the key, and this endpoint is a diagnostic rather than a customer
    // surface. `type` is what distinguishes a bad key from a network fault.
    const e = err as { message?: string; type?: string };
    return { ok: false, error: e?.message ?? String(err), errorType: e?.type };
  }
}

// Stripe Connect (a founder linking their OWN Stripe account for Map's revenue numbers) —
// requires the OAuth client id on top of the secret key.
export function stripeConfigured() {
  return Boolean(secretKey() && process.env.STRIPE_CLIENT_ID);
}

/**
 * Checkout needs only the key. The WEBHOOK additionally needs the signing secret, and those are
 * deliberately separate questions.
 *
 * Without the webhook secret a customer can still pay and Stripe still charges them — but nothing
 * would write the subscription back to our database, so they would pay and stay locked out.
 * `billingConfigured()` therefore means "safe to take money", and requires both.
 */
export function checkoutConfigured() {
  return Boolean(secretKey());
}

export function billingConfigured() {
  return Boolean(secretKey() && process.env.STRIPE_WEBHOOK_SECRET);
}

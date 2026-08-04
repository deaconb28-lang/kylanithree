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

/** Live vs test, from the key's own prefix. Worth surfacing before anyone charges a real card. */
export function stripeMode(): "live" | "test" | "unset" {
  const key = secretKey();
  if (!key) return "unset";
  return key.startsWith("sk_live_") ? "live" : "test";
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

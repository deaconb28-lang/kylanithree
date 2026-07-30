import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

// Stripe Connect (a founder linking their OWN Stripe account for Map's revenue numbers) —
// requires the OAuth client id on top of the secret key.
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CLIENT_ID);
}

// Kylani's own subscription billing (Pro/Founder) — the webhook needs the signing secret to
// verify events actually came from Stripe.
export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

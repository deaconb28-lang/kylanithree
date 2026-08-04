// One plan, one price, and the price lives in Stripe rather than here.
//
// This replaced two tiers (Pro / Founder) across two intervals, sold through four hardcoded Stripe
// Payment Link URLs. Those links had a specific virtue worth preserving deliberately rather than by
// accident: the amount a buyer saw came from Stripe, so it could never drift out of sync with the
// number in our own UI. Moving to the API gives that up unless the code is careful, which is why
// `PLAN.amountCents` below is the number used to CREATE the price and `lib/stripePrice.ts`
// resolves the live one by lookup key — the displayed figure and the charged figure come from the
// same constant, and Stripe stays the system of record for what was actually billed.

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

/**
 * Plans that may appear on a subscription document.
 *
 * "kylani" is the only one that can be sold now. "pro" and "founder" are LEGACY and still readable:
 * anyone who subscribed under the old tiers has that string in Mongo, and treating it as unknown
 * would lock a paying customer out of the product they are still being charged for. They are never
 * offered, only honoured.
 */
export type SubscriptionPlan = "kylani" | "pro" | "founder";

const LEGACY_PLANS: SubscriptionPlan[] = ["pro", "founder"];

export function isPlan(v: string | undefined): v is SubscriptionPlan {
  return v === "kylani" || v === "pro" || v === "founder";
}

export function isLegacyPlan(v: string | undefined): boolean {
  return LEGACY_PLANS.includes(v as SubscriptionPlan);
}

/** Kept only so old rows and old checkout sessions still parse. Nothing new is sold annually. */
export type BillingInterval = "monthly" | "annual";
export function isInterval(v: string | undefined): v is BillingInterval {
  return v === "monthly" || v === "annual";
}

export const PLAN = {
  id: "kylani" as const,
  name: "Kylani",
  /** Cents, because that is the unit Stripe bills in and rounding a float here would be real money. */
  amountCents: 4999,
  currency: "usd",
  interval: "month" as const,
  /**
   * The stable handle for this price in Stripe. `lib/stripePrice.ts` resolves the live Price by
   * this key, so the app never holds a `price_…` id that could point at the wrong amount after
   * someone edits the dashboard.
   *
   * It encodes the amount on purpose: changing the price means a NEW key, because a Stripe Price is
   * immutable and reusing the key for a different amount would silently charge the old one.
   */
  lookupKey: "kylani_monthly_4999",
  tagline: "Everything, from one inbox. Cancel any time.",
  features: [
    // No network count here on purpose. Five are crawling, two more are built and blocked on
    // credentials, and a number on the pricing page would be a claim that goes stale the moment
    // either of those changes — the same rule the hero's field caption is held to.
    "Buyers found by name, wherever they are already posting",
    "A reply drafted for each one, anchored to what they said",
    "Nothing sends without your approval",
    "Weekly findings in plain language",
    "Suppression and compliance built in",
  ],
} as const;

/** "$49.99" — formatted from the same cents the charge is created with, never typed by hand. */
export function formattedPrice(): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: PLAN.currency.toUpperCase() }).format(
    PLAN.amountCents / 100,
  );
}

/** Days of full access before the paywall. App-side, so no card is needed to start. */
export const TRIAL_DAYS = 7;

/**
 * Daily send ceiling. One plan means one number — the old map keyed a different cap per tier.
 * Legacy subscribers keep the higher Founder ceiling they paid for rather than being quietly
 * downgraded by a pricing change they did not ask for.
 */
export const DAILY_CAP_MAX: Record<SubscriptionPlan | "trial", number> = {
  trial: 60,
  kylani: 150,
  pro: 60,
  founder: 150,
};

export const PLAN_COPY: Record<SubscriptionPlan, { name: string; tagline: string; features: string[] }> = {
  kylani: { name: PLAN.name, tagline: PLAN.tagline, features: [...PLAN.features] },
  // Legacy names still render for anyone who holds them. Never offered to a new customer.
  pro: { name: "Kylani Pro", tagline: "Your original plan, still active.", features: [...PLAN.features] },
  founder: { name: "Kylani Founder", tagline: "Your original plan, still active.", features: [...PLAN.features] },
};

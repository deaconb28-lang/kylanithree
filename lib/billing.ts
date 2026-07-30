export type SubscriptionPlan = "pro" | "founder";
export type BillingInterval = "monthly" | "annual";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

export function isPlan(v: string | undefined): v is SubscriptionPlan {
  return v === "pro" || v === "founder";
}

export function isInterval(v: string | undefined): v is BillingInterval {
  return v === "monthly" || v === "annual";
}

// Real, live Stripe Payment Links — provided directly by the founder, not generated. Each one is
// a fixed, pre-configured Stripe Checkout page; we never see or set the price ourselves, so the
// amount shown to the buyer always comes straight from Stripe and can't drift out of sync with
// whatever's in our own UI.
export const PAYMENT_LINKS: Record<SubscriptionPlan, Record<BillingInterval, string>> = {
  pro: {
    monthly: "https://buy.stripe.com/fZu6oG3Sa1Xr5Z56x30x205",
    annual: "https://buy.stripe.com/00w6oG60i45z87d2gN0x203",
  },
  founder: {
    monthly: "https://buy.stripe.com/3cIaEW74m31vgDJ5sZ0x204",
    annual: "https://buy.stripe.com/bJe6oGgEW0Tn0EL08F0x202",
  },
};

export const PLAN_COPY: Record<SubscriptionPlan, { name: string; tagline: string; features: string[] }> = {
  pro: {
    name: "Kylani Pro",
    tagline: "Everything you need to run real outreach from your own inbox.",
    features: [
      "Human-approved drafts, never auto-sent",
      "Buyer discovery across Reddit, Slack, Discord, and email",
      "Weekly Findings reports, in plain language",
      "Suppression and compliance built in",
      "Email support",
    ],
  },
  founder: {
    name: "Kylani Founder",
    tagline: "Higher volume and closer support for founders pushing hardest on outreach.",
    features: [
      "Everything in Pro",
      "Higher daily send-cap ceiling",
      "Priority support with faster response times",
      "Early access to new channels and features as they ship",
    ],
  },
};

// Encodes both the user and exactly which plan/interval they clicked into client_reference_id, so
// the webhook can attribute a completed checkout without us having to look up Stripe Price IDs —
// there are only 4 fixed Payment Links, so the combination is unambiguous.
export function buildCheckoutUrl(plan: SubscriptionPlan, interval: BillingInterval, userId: string, email?: string | null) {
  const params = new URLSearchParams({ client_reference_id: `${userId}::${plan}::${interval}` });
  if (email) params.set("prefilled_email", email);
  return `${PAYMENT_LINKS[plan][interval]}?${params.toString()}`;
}

export const DAILY_CAP_MAX: Record<SubscriptionPlan | "trial", number> = {
  trial: 60,
  pro: 60,
  founder: 150,
};

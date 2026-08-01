// The rate card, as data and versioned.
//
// Versioned because a usage event has to record the card it was priced under. Repricing later
// without a version stamp silently rewrites history — last month's margin analysis changes because
// this month's prices did, and nobody can tell which is which.

export const RATE_CARD_VERSION = 1;

export type BillableAction =
  | "lead.basic"
  | "lead.standard"
  | "lead.verified"
  | "contact.unlock"
  | "message.email"
  | "message.dm"
  | "message.followup"
  // Zero-cost actions are still metered. Knowing how much drafting an account does is worth having
  // even though we never charge for it, and a zero here is an explicit decision rather than an
  // action nobody remembered to price.
  | "draft.write"
  | "draft.rewrite"
  | "analytics.read";

export const RATE_CARD: Record<BillableAction, number> = {
  // Charge for the scarce thing. Enrichment and contact resolution cost real money per unit;
  // sends cost fractions of a cent, so they stay cheap — the behaviour that creates value must
  // never be the behaviour people ration.
  "lead.basic": 1,
  "lead.standard": 3,
  "lead.verified": 6,
  "contact.unlock": 2,
  "message.email": 1,
  "message.dm": 3,
  "message.followup": 1,
  "draft.write": 0,
  "draft.rewrite": 0,
  "analytics.read": 0,
};

export type LeadTier = "basic" | "standard" | "verified";

/**
 * Which tier a lead falls into, from what we actually resolved about the person.
 *
 * Internally the true cost is a stack (base x source x verification x recency x intent), but the
 * price shown is one of three fixed tiers: a floating multiplier makes cost impossible to predict
 * before committing, so we bucket the score and price the bucket.
 */
export function leadTier(lead: { email?: string | null; role?: string | null; authorHandle?: string | null; intentTier?: string | null }): LeadTier {
  if (lead.email) return "verified";
  // A handle plus a real role is enough to write to them somewhere; without a role it is just a
  // post with a name on it.
  if (lead.authorHandle && lead.role) return "standard";
  return "basic";
}

export function creditsFor(action: BillableAction): number {
  return RATE_CARD[action];
}

export function creditsForLead(tier: LeadTier): number {
  return RATE_CARD[`lead.${tier}` as BillableAction];
}

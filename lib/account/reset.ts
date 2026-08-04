import {
  Campaigns,
  Leads,
  Communities,
  Hypotheses,
  Findings,
  SearchRuns,
  AccountBilling,
  type StripeConnection,
  type SubscriptionInfo,
} from "../collections";
import { Searches } from "../discover/collections";

// Deleting a campaign so the founder can start fresh.
//
// The interesting part of this is not what it removes, it is the three things it deliberately keeps,
// each for a different reason. "Delete everything" is the obvious implementation and every one of
// these would be a real fault:
//
//  - SUPPRESSIONS. A suppression is somebody who clicked unsubscribe, bounced, or was flagged as an
//    existing customer. Deleting that record makes them contactable again — so "start fresh" would
//    quietly mean "email the people who told us to stop". That is a compliance failure and a harm to
//    a third party who never had any say in this account, and no amount of wanting a clean slate
//    justifies it. Kept, always.
//
//  - LEAD CHARGES. One row per person per account, ever, enforcing "charged once for a person,
//    lifetime" (lib/credits). If deletion cleared these, deleting a campaign would reset every
//    lifetime charge — free credits for the price of one button, repeatedly. Kept.
//
//  - BILLING. The subscription and any connected Stripe account live on the campaign document, so
//    deleting the row would strand a paying customer: Stripe keeps taking the money and nothing in
//    our database says they are subscribed. They are lifted onto an account-scoped record first and
//    restored onto whatever campaign is created next.
//
// Usage events are kept too — they are accounting, and rewriting history to make a bill smaller is
// not a thing a delete button should do.

export interface DeleteCampaignResult {
  deleted: Record<string, number>;
  /** Preserved, and named so the UI can say so rather than implying everything went. */
  kept: { suppressions: number };
  billingCarriedOver: boolean;
}

/**
 * Wipes a campaign and everything derived from it, keeping the records above.
 *
 * Order matters at exactly one point: the campaign row is removed LAST. Every other collection is
 * reachable only through it, so a failure part-way leaves an account whose campaign still loads and
 * whose lead list is short — recoverable, and visible. Deleting the campaign first would leave the
 * rest orphaned with nothing pointing at it.
 */
export async function deleteCampaign(userId: string): Promise<DeleteCampaignResult> {
  const campaigns = await Campaigns();
  const campaign = await campaigns.findOne({ userId });

  const billingCarriedOver = campaign ? await carryBillingForward(userId, campaign.subscription, campaign.stripe) : false;

  const [leads, communities, hypotheses, findings, searchRuns] = await Promise.all([
    Leads(),
    Communities(),
    Hypotheses(),
    Findings(),
    SearchRuns(),
  ]);

  const deleted: Record<string, number> = {};
  const wipe = async (name: string, run: () => Promise<{ deletedCount?: number }>) => {
    try {
      deleted[name] = (await run()).deletedCount ?? 0;
    } catch (err) {
      // One collection failing must not abandon the rest half-deleted. Recorded as -1 so the caller
      // can see a partial delete instead of reading a missing key as "there was nothing there".
      deleted[name] = -1;
      console.error(`[reset] could not clear ${name}:`, err instanceof Error ? err.message : err);
    }
  };

  await wipe("leads", () => leads.deleteMany({ userId }));
  await wipe("communities", () => communities.deleteMany({ userId }));
  await wipe("hypotheses", () => hypotheses.deleteMany({ userId }));
  await wipe("findings", () => findings.deleteMany({ userId }));
  await wipe("searchRuns", () => searchRuns.deleteMany({ userId }));

  // Discover runs claimed by this account. A claimed run holds the leads the founder just saw, so
  // leaving it behind would let the old product's results reappear the moment they revisited the
  // link — the same "stuck on someone else's data" failure the seeded demo campaign used to cause.
  //
  // `analyticsEvents` is deliberately untouched: it is keyed by an anonymous per-browser id and
  // carries no userId, so there is nothing here to target, and it is aggregate funnel data about
  // the product rather than this founder's work.
  await wipe("discoverRuns", async () => (await Searches()).deleteMany({ userId }));

  let suppressionsKept = 0;
  try {
    const { Suppressions } = await import("../collections");
    suppressionsKept = await (await Suppressions()).countDocuments({ userId });
  } catch {
    // Counting is for the confirmation message only. Never worth failing the delete.
  }

  await wipe("campaign", () => campaigns.deleteMany({ userId }));

  return { deleted, kept: { suppressions: suppressionsKept }, billingCarriedOver };
}

/**
 * Lift billing off the campaign and onto the account, so a delete cannot orphan a paying customer.
 *
 * Only writes when there is something to keep. An account that never subscribed and never connected
 * Stripe gets no row at all, which keeps "has this account ever had billing" answerable rather than
 * turning it into a collection of empty shells.
 */
async function carryBillingForward(
  userId: string,
  subscription: SubscriptionInfo | undefined,
  stripe: StripeConnection | undefined,
): Promise<boolean> {
  if (!subscription && !stripe?.connected) return false;
  try {
    await (await AccountBilling()).updateOne(
      { userId },
      {
        $set: {
          userId,
          ...(subscription ? { subscription } : {}),
          ...(stripe ? { stripe } : {}),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.error("[reset] could not carry billing forward:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * The other half: put billing back on a newly created campaign.
 *
 * Called after a campaign is created rather than merged into the insert, so both creation paths
 * (discover claim and legacy onboarding finalize) get it from one place and neither can quietly
 * skip it. A no-op for the overwhelming majority of accounts, which have never had a row here.
 */
export async function restoreBillingOnto(userId: string): Promise<boolean> {
  try {
    const carried = await (await AccountBilling()).findOne({ userId });
    if (!carried?.subscription && !carried?.stripe) return false;
    await (await Campaigns()).updateOne(
      { userId },
      {
        $set: {
          ...(carried.subscription ? { subscription: carried.subscription } : {}),
          ...(carried.stripe ? { stripe: carried.stripe } : {}),
          updatedAt: new Date(),
        },
      },
    );
    return true;
  } catch (err) {
    // Never fatal to creating a campaign. A founder blocked from onboarding because we could not
    // reattach their subscription is a worse outcome than one who has to reopen billing.
    console.error("[reset] could not restore billing:", err instanceof Error ? err.message : err);
    return false;
  }
}

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, billingConfigured } from "@/lib/stripe";
import { Campaigns } from "@/lib/collections";
import { PLAN, type SubscriptionStatus } from "@/lib/billing";
import { Referrals, REFERRAL_REWARD_CENTS } from "@/lib/referrals";

export const runtime = "nodejs";

function statusFromStripe(sub: Stripe.Subscription, eventType: string): SubscriptionStatus {
  if (eventType === "customer.subscription.deleted") return "canceled";
  if (sub.status === "active" || sub.status === "trialing") return "active";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  if (sub.status === "canceled") return "canceled";
  return "incomplete";
}

// Public, unauthenticated — Stripe calls this directly, verified by signature rather than a session.
// This is the real source of truth for subscription state; the post-checkout redirect is UX polish
// the app never relies on.
export async function POST(req: NextRequest) {
  if (!billingConfigured()) {
    console.error("[stripe/webhook] Stripe key or STRIPE_WEBHOOK_SECRET missing.");
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const campaigns = await Campaigns();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // One plan now, so client_reference_id is just the user id — it used to carry
        // `userId::plan::interval` because four Payment Links had to be told apart.
        const userId = session.client_reference_id ?? "";
        if (!userId || !session.customer || !session.subscription) {
          console.error("[stripe/webhook] checkout.session.completed missing expected fields:", userId);
          break;
        }
        await campaigns.updateOne(
          { userId },
          {
            $set: {
              subscription: {
                plan: PLAN.id,
                interval: "monthly" as const,
                status: "active" as const,
                stripeCustomerId: String(session.customer),
                stripeSubscriptionId: String(session.subscription),
                updatedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          },
        );
        // They now have a Stripe customer, so any credit they earned BEFORE subscribing can finally
        // be paid. Without this a referral earned by a trial user stays `qualified` forever, which
        // would make the dashboard's "they apply automatically to your next invoice" a lie.
        await settleQualifiedReferrals(userId, String(session.customer));
        break;
      }

      case "invoice.payment_succeeded": {
        // The referral reward fires HERE and nowhere else — see lib/referrals.ts. Rewarding at
        // signup would make a referral worth $49.99 for the cost of an email address; rewarding on
        // a cleared payment means an attacker must pay us the same amount they extract.
        await rewardReferrerIfEarned(event.data.object as Stripe.Invoice);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // current_period_end moved from the subscription to its first item in this API version.
        const periodEnd = sub.items.data[0]?.current_period_end;
        await campaigns.updateOne(
          { "subscription.stripeSubscriptionId": sub.id },
          {
            $set: {
              "subscription.status": statusFromStripe(sub, event.type),
              "subscription.currentPeriodEnd": periodEnd ? new Date(periodEnd * 1000) : null,
              "subscription.updatedAt": new Date(),
              updatedAt: new Date(),
            },
          },
        );
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] Failed to process event:", event.type, err instanceof Error ? err.message : err);
    // Non-2xx so Stripe retries — this is our own write failing, not a bad event.
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }
}

/**
 * Credit a referrer once their referee has actually paid.
 *
 * Three guards, each closing a specific hole:
 *
 *  - `amount_paid > 0` — a referee's FIRST invoice is $0, because their coupon covered it. Paying a
 *    reward on that invoice would mean the referral cost $49.99 twice and earned nothing, and every
 *    single referee would trigger it automatically.
 *  - `status: "pending"` sits in the update FILTER, so the write only lands on a row nobody has
 *    claimed. Stripe retries this event freely, and the database decides — not a read-then-write
 *    that could lose the race.
 *  - The Stripe credit is written only after that transition succeeds, so the terminal state is
 *    reached at most once.
 */
async function rewardReferrerIfEarned(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return;

  const rawSubscription = (invoice as unknown as { subscription?: unknown }).subscription;
  const subscriptionId =
    typeof rawSubscription === "string"
      ? rawSubscription
      : (rawSubscription as { id?: string } | undefined)?.id;
  if (!subscriptionId) return;

  const referrals = await Referrals();
  const campaigns = await Campaigns();

  // Whose payment was this? Resolved through our own record of the subscription rather than through
  // Stripe metadata alone, so a subscription created by hand still attributes correctly.
  const payer = await campaigns.findOne({ "subscription.stripeSubscriptionId": subscriptionId });
  if (!payer?.userId) return;

  // Claim the referral atomically. Nothing back means there was no pending referral for this payer
  // — either they were not referred, or a retry already took it.
  const claimed = await referrals.findOneAndUpdate(
    { referredUserId: payer.userId, status: "pending" },
    { $set: { status: "qualified", qualifiedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed?.referrerUserId) return;

  const referrerCampaign = await campaigns.findOne({ userId: claimed.referrerUserId });
  const referrerCustomer = referrerCampaign?.subscription?.stripeCustomerId;
  if (!referrerCustomer) {
    // Earned but not payable yet: the referrer has never subscribed, so there is no Stripe customer
    // to credit. The row stays `qualified`, which is the honest state — owed, not paid — and it can
    // be settled when they do subscribe rather than being silently forgotten.
    console.error(`[stripe/webhook] referral qualified but referrer ${claimed.referrerUserId} has no Stripe customer yet`);
    return;
  }

  // A NEGATIVE balance transaction is a credit in Stripe's model: it reduces what the customer owes
  // on their next invoice, automatically. No payout rails, and no way for it to leave as cash.
  const credit = await stripe.customers.createBalanceTransaction(referrerCustomer, {
    amount: -REFERRAL_REWARD_CENTS,
    currency: PLAN.currency,
    description: "Referral reward — someone you referred subscribed",
  });

  await referrals.updateOne(
    { referredUserId: payer.userId },
    {
      $set: {
        status: "rewarded",
        rewardedAt: new Date(),
        // Recorded on the row so a later price change cannot rewrite what this referral was worth.
        rewardCents: REFERRAL_REWARD_CENTS,
        stripeCreditTxnId: credit.id,
      },
    },
  );
  console.error(`[stripe/webhook] credited referrer ${claimed.referrerUserId} ${REFERRAL_REWARD_CENTS} cents (${credit.id})`);
}

/**
 * Pay out credits that were earned before the referrer had anywhere to put them.
 *
 * `rewardReferrerIfEarned` leaves a row `qualified` when the referrer has no Stripe customer — which
 * is the normal case, because most referrers are still on the free trial when their first referee
 * pays. This is the other half of that: the moment they subscribe, they get a customer id, and every
 * credit they are owed is applied.
 *
 * Each row is CLAIMED before its credit is created, not after, so a webhook retry cannot pay the
 * same referral twice; a Stripe failure hands the row back. The one window left is a crash between
 * the claim and the credit, which leaves a `rewarded` row with no `stripeCreditTxnId` — visible in
 * the data rather than silent, and the safe direction to fail in (a missed credit can be granted by
 * hand; a duplicate one is money out the door).
 */
async function settleQualifiedReferrals(referrerUserId: string, customerId: string): Promise<void> {
  const referrals = await Referrals();
  // Bounded: this runs inside a webhook with a request budget, and nobody legitimately banks
  // dozens of unpaid credits. Any beyond this settle on the next subscription event.
  for (let i = 0; i < 20; i++) {
    const claimed = await referrals.findOneAndUpdate(
      { referrerUserId, status: "qualified" },
      { $set: { status: "rewarded", rewardedAt: new Date(), rewardCents: REFERRAL_REWARD_CENTS } },
      { returnDocument: "after" },
    );
    if (!claimed) return;

    try {
      const credit = await stripe.customers.createBalanceTransaction(customerId, {
        amount: -REFERRAL_REWARD_CENTS,
        currency: PLAN.currency,
        description: "Referral reward — someone you referred subscribed",
      });
      await referrals.updateOne({ referredUserId: claimed.referredUserId }, { $set: { stripeCreditTxnId: credit.id } });
      console.error(`[stripe/webhook] settled backdated referral credit for ${referrerUserId} (${credit.id})`);
    } catch (err) {
      // Hand it back rather than marking it paid. Owed-and-visible beats paid-and-untrue.
      await referrals.updateOne(
        { referredUserId: claimed.referredUserId, status: "rewarded", stripeCreditTxnId: { $exists: false } },
        { $set: { status: "qualified" }, $unset: { rewardedAt: "", rewardCents: "" } },
      );
      console.error("[stripe/webhook] could not settle referral credit:", err instanceof Error ? err.message : err);
      return;
    }
  }
}

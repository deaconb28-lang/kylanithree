import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { auth } from "@/auth";
import { stripe, checkoutConfigured, billingConfigured } from "@/lib/stripe";
import { resolvePriceId, PriceUnavailable } from "@/lib/stripePrice";
import { PLAN } from "@/lib/billing";
import { Referrals, REFERRAL_REWARD_CENTS } from "@/lib/referrals";
import { toUserError } from "@/lib/apiError";

export const runtime = "nodejs";

// Real Stripe Checkout, replacing four hardcoded Payment Link URLs.
//
// The links had one virtue this has to keep deliberately: the buyer's amount came from Stripe, so
// it could not drift from the UI. `resolvePriceId()` preserves that by resolving the live Price by
// a lookup key that encodes the amount — see lib/stripePrice.ts.
//
// What the links could NOT do, and why they had to go: apply a per-customer discount. A referral
// coupon has to be attached to one specific session for one specific buyer, which a fixed public
// URL cannot express.

/**
 * Refuses to open checkout when the webhook is not configured, and that is the important guard.
 *
 * Without a webhook secret Stripe still takes the money — the customer is charged, the card is
 * debited — and nothing ever writes the subscription back to Mongo. They would pay and remain
 * locked out, with no error anywhere. Taking money we cannot record is worse than not selling.
 */
export async function POST(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { userId, campaign } = result;

  if (!checkoutConfigured()) {
    console.error("[stripe/checkout] No Stripe key (STRIPE_SECRET_KEY or STRIPE_API_KEY).");
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  }
  if (!billingConfigured()) {
    console.error("[stripe/checkout] STRIPE_WEBHOOK_SECRET missing — refusing to charge a card we could not record.");
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  }

  if (campaign.subscription?.status === "active") {
    return NextResponse.json({ error: "You're already subscribed." }, { status: 400 });
  }

  try {
    const price = await resolvePriceId();
    const origin = req.nextUrl.origin;

    // Was this person referred? Their first month is free if so. Read from our own database rather
    // than from anything the browser sends — a coupon driven by a request parameter is a coupon
    // anybody can mint for themselves.
    const referral = await (await Referrals()).findOne({ referredUserId: userId, status: "pending" });
    const discounts = referral ? await firstMonthFreeDiscount() : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      // Carries the account through to the webhook. The old scheme packed plan and interval in here
      // too; with one plan the user id is the whole answer.
      client_reference_id: userId,
      customer_email: (await auth())?.user?.email ?? undefined,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      subscription_data: {
        // Read back on invoice.payment_succeeded to decide whether a referrer has earned a credit.
        metadata: { kylani_user_id: userId, ...(referral ? { kylani_referred_by: referral.referrerUserId } : {}) },
      },
      success_url: `${origin}/app/trial?billing=success`,
      cancel_url: `${origin}/app/trial?billing=cancelled`,
    });

    if (!session.url) throw new Error("Stripe returned a session with no URL");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof PriceUnavailable) {
      // The one failure worth its own message: the price could not be resolved or disagreed with
      // what the product displays. Never fall through to some other price.
      console.error("[stripe/checkout]", err.message);
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
    }
    return NextResponse.json(
      { error: toUserError("stripe/checkout", err, "Couldn't open checkout right now.") },
      { status: 500 },
    );
  }
}

/**
 * A coupon worth exactly one month, reused across referees.
 *
 * Looked up by a fixed id rather than created per checkout: a coupon per session would leave
 * thousands of single-use coupons in the account, and Stripe deletes nothing.
 */
async function firstMonthFreeDiscount() {
  const id = `kylani_referral_first_month_${REFERRAL_REWARD_CENTS}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    try {
      await stripe.coupons.create({
        id,
        amount_off: REFERRAL_REWARD_CENTS,
        currency: PLAN.currency,
        duration: "once",
        name: "Referred — first month free",
      });
    } catch (err) {
      // A referee losing their discount must not stop them subscribing. Loud, then carry on at
      // full price rather than failing the checkout.
      console.error("[stripe/checkout] referral coupon unavailable, continuing at full price:", err instanceof Error ? err.message : err);
      return undefined;
    }
  }
  return [{ coupon: id }];
}

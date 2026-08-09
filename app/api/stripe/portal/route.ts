import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { stripe } from "@/lib/stripe";
import { toUserError } from "@/lib/apiError";

// Redirects into Stripe's hosted Billing Portal so a subscriber can update payment method,
// switch plan, or cancel — requires the Customer Portal to be turned on for this Stripe account
// (Settings -> Billing -> Customer portal in the Stripe Dashboard).
export async function GET(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;

  const customerId = result.campaign.subscription?.stripeCustomerId;
  if (!customerId) {
    const url = new URL("/app/trial", req.nextUrl.origin);
    url.searchParams.set("billing", "no-subscription");
    return NextResponse.redirect(url);
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: new URL("/app/trial", req.nextUrl.origin).toString(),
    });
    return NextResponse.redirect(portalSession.url);
  } catch (err) {
    toUserError("stripe/portal", err, "Couldn't open billing right now.");
    const url = new URL("/app/trial", req.nextUrl.origin);
    url.searchParams.set("billing", "error");
    return NextResponse.redirect(url);
  }
}

import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns } from "@/lib/collections";
import { stripe, stripeConfigured } from "@/lib/stripe";

export async function POST() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { userId, campaign } = result;

  if (stripeConfigured() && campaign.stripe?.accountId) {
    try {
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CLIENT_ID,
        stripe_user_id: campaign.stripe.accountId,
      });
    } catch {
      // Account may already be disconnected on Stripe's side — proceed to clear it locally regardless.
    }
  }

  const campaigns = await Campaigns();
  await campaigns.updateOne({ userId }, { $set: { stripe: { connected: false }, updatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}

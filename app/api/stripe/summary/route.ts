import Stripe from "stripe";
import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;

  const { campaign } = result;
  if (!campaign.stripe?.connected || !campaign.stripe.accessToken) {
    return NextResponse.json({ connected: false });
  }

  try {
    const connected = new Stripe(campaign.stripe.accessToken);
    const [balance, charges] = await Promise.all([
      connected.balance.retrieve(),
      connected.charges.list({ limit: 25 }),
    ]);

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const currency = balance.available[0]?.currency ?? "usd";
    const succeeded = charges.data.filter((c) => c.status === "succeeded" && !c.refunded);
    const totalVolume = succeeded.reduce((sum, c) => sum + c.amount, 0);

    return NextResponse.json({
      connected: true,
      currency,
      availableCents: available,
      totalVolumeCents: totalVolume,
      chargeCount: succeeded.length,
      recentCharges: succeeded.slice(0, 5).map((c) => ({
        id: c.id,
        amountCents: c.amount,
        email: c.billing_details?.email ?? c.receipt_email ?? null,
        created: c.created,
      })),
    });
  } catch {
    return NextResponse.json({ connected: true, error: "Couldn't reach Stripe." }, { status: 502 });
  }
}

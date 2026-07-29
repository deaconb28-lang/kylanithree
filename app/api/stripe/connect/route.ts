import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { stripe, stripeConfigured } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe isn't configured on this deployment yet." }, { status: 503 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/stripe/callback`;
  const url = stripe.oauth.authorizeUrl({
    client_id: process.env.STRIPE_CLIENT_ID,
    response_type: "code",
    scope: "read_only",
    redirect_uri: redirectUri,
    state: userId,
  });

  return NextResponse.redirect(url);
}

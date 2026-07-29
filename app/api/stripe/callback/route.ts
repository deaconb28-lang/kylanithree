import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { Campaigns } from "@/lib/collections";
import { stripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const settingsUrl = new URL("/app/settings", req.nextUrl.origin);

  if (oauthError || !code || state !== userId) {
    settingsUrl.searchParams.set("stripe", "denied");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const campaigns = await Campaigns();
    await campaigns.updateOne(
      { userId },
      {
        $set: {
          stripe: {
            connected: true,
            accountId: token.stripe_user_id,
            accessToken: token.access_token,
            connectedAt: new Date(),
          },
          updatedAt: new Date(),
        },
      },
    );
    settingsUrl.searchParams.set("stripe", "connected");
  } catch {
    settingsUrl.searchParams.set("stripe", "error");
  }

  return NextResponse.redirect(settingsUrl);
}

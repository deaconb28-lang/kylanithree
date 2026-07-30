import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUserId } from "@/lib/apiAuth";
import { buildCheckoutUrl } from "@/lib/billing";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const session = await auth();
  const email = session?.user?.email ?? null;

  return NextResponse.json({
    pro: { monthly: buildCheckoutUrl("pro", "monthly", userId, email), annual: buildCheckoutUrl("pro", "annual", userId, email) },
    founder: { monthly: buildCheckoutUrl("founder", "monthly", userId, email), annual: buildCheckoutUrl("founder", "annual", userId, email) },
  });
}

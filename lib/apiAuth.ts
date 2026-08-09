import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Campaigns } from "./collections";

export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return userId;
}

// This used to call ensureSeeded(), which INVENTED a campaign — the fictional "Dockside" logistics
// company, 104 buyers, $41,200 of revenue — and wrote it into the account of anyone who reached a
// dashboard route without one. Whichever page loaded first won the race against onboarding's own
// finalize call, and the founder was left looking at someone else's demo data forever.
//
// No campaign now means no campaign. The route says so, and the UI sends them to onboarding.
export async function requireCampaign() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return { error: userId };
  const campaigns = await Campaigns();
  const campaign = await campaigns.findOne({ userId });
  if (!campaign) {
    return {
      error: NextResponse.json(
        { error: "No campaign yet.", needsOnboarding: true },
        { status: 404 },
      ),
    };
  }
  return { userId, campaign };
}

export async function getCampaignFor(userId: string) {
  const campaigns = await Campaigns();
  return campaigns.findOne({ userId });
}

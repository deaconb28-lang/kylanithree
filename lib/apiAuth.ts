import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeeded } from "./seed";
import { Campaigns } from "./collections";

export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return userId;
}

export async function requireCampaign() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return { error: userId };
  const campaign = await ensureSeeded(userId);
  return { userId, campaign };
}

export async function getCampaignFor(userId: string) {
  const campaigns = await Campaigns();
  return campaigns.findOne({ userId });
}

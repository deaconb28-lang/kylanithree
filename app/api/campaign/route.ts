import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns } from "@/lib/collections";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  return NextResponse.json(result.campaign);
}

export async function PATCH(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  for (const key of ["whatYouSell", "dailyCap", "paused", "channels", "productUrl"]) {
    if (key in body) allowed[key] = body[key];
  }
  allowed.updatedAt = new Date();

  const campaigns = await Campaigns();
  await campaigns.updateOne({ userId: result.userId }, { $set: allowed });
  const updated = await campaigns.findOne({ userId: result.userId });
  return NextResponse.json(updated);
}

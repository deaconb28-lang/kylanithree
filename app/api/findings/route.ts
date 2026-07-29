import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Findings } from "@/lib/collections";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const findings = await Findings();
  const docs = await findings.find({ userId: result.userId }).sort({ createdAt: 1 }).toArray();
  return NextResponse.json({ findings: docs, stats: result.campaign.stats });
}

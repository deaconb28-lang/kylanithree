import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Suppressions } from "@/lib/collections";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const suppressions = await Suppressions();
  const list = await suppressions.find({ userId: result.userId }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json(list);
}

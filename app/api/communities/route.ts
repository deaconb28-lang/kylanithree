import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Communities } from "@/lib/collections";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const communities = await Communities();
  const docs = await communities.find({ userId: result.userId }).toArray();
  return NextResponse.json(docs);
}

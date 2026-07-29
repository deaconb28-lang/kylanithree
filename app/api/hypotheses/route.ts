import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Hypotheses } from "@/lib/collections";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const hypotheses = await Hypotheses();
  const docs = await hypotheses.find({ userId: result.userId }).toArray();
  return NextResponse.json(docs);
}

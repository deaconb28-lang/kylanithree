import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Hypotheses } from "@/lib/collections";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { key } = await ctx.params;
  const { status } = await req.json();

  const hypotheses = await Hypotheses();
  await hypotheses.updateOne({ userId: result.userId, key }, { $set: { status, updatedAt: new Date() } });
  const updated = await hypotheses.findOne({ userId: result.userId, key });
  return NextResponse.json(updated);
}

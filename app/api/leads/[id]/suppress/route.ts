import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads, Suppressions, type SuppressionReason } from "@/lib/collections";
import { SUPPRESSION_REASONS } from "@/lib/suppression";

// Manual counterpart to the automatic unsubscribe-link flow (see app/api/unsubscribe/route.ts) —
// for when the founder already knows a contact shouldn't be written to again (an existing
// customer, a bounce they saw themselves, or someone who asked to stop elsewhere).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { id } = await ctx.params;
  const body = await req.json();
  const reason = body.reason as SuppressionReason;
  if (!SUPPRESSION_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Not a valid suppression reason." }, { status: 400 });
  }

  const leads = await Leads();
  const lead = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const suppressions = await Suppressions();
  await suppressions.insertOne({
    userId: result.userId,
    campaignId: lead.campaignId,
    name: lead.name,
    role: lead.role,
    email: lead.email ?? null,
    reason,
    where: `${lead.source}${lead.company ? " · " + lead.company : ""}`,
    leadId: id,
    createdAt: new Date(),
  });

  await leads.updateOne({ _id: new ObjectId(id), userId: result.userId }, { $set: { status: "dropped", updatedAt: new Date() } });
  const updated = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });
  return NextResponse.json(updated);
}

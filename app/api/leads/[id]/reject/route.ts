import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads } from "@/lib/collections";
import { LeadRejections, REJECTION_REASONS, ensureRejectionIndexes, type RejectionReason } from "@/lib/leads/rejections";
import { toUserError } from "@/lib/apiError";

// "Not a fit", with the reason attached.
//
// The reason is REQUIRED. A dismissal without one is a lost signal, and this is the only place the
// product learns what a specific founder does not want — which is the difference between a search
// that improves for them and one that stays generically average forever.
//
// Distinct from /suppress, which it resembles: suppression protects a person from ever being
// contacted again, this corrects what gets shown. Dropping a lead as off-target must never
// blocklist the human behind it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireCampaign();
    if ("error" in result) return result.error;
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason as RejectionReason;
    if (!REJECTION_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Pick a reason so the next search can use it." }, { status: 400 });
    }

    const leads = await Leads();
    const lead = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });
    if (!lead) return NextResponse.json({ error: "That lead is no longer here." }, { status: 404 });

    await ensureRejectionIndexes();
    await (await LeadRejections()).insertOne({
      userId: result.userId,
      campaignId: lead.campaignId,
      leadId: id,
      reason,
      // Copied off the lead rather than joined later, so the signal survives the lead being removed.
      hypothesisKey: lead.hypothesisKey,
      source: lead.source,
      createdAt: new Date(),
    });

    await leads.updateOne({ _id: new ObjectId(id) }, { $set: { status: "dropped", updatedAt: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toUserError("lead reject", err, "Couldn't record that. Try again.") }, { status: 500 });
  }
}

/** Undo. The inline row offers ~2 seconds of it, so the write has to be reversible. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireCampaign();
    if ("error" in result) return result.error;
    const { id } = await ctx.params;

    await (await LeadRejections()).deleteMany({ userId: result.userId, leadId: id });
    const leads = await Leads();
    await leads.updateOne(
      { _id: new ObjectId(id), userId: result.userId },
      { $set: { status: "waiting", updatedAt: new Date() } },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toUserError("lead unreject", err, "Couldn't undo that.") }, { status: 500 });
  }
}

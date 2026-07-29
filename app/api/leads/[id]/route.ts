import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns, Leads } from "@/lib/collections";
import { sendGmail } from "@/lib/gmail";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { id } = await ctx.params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  for (const key of ["status", "draft", "feedback"]) {
    if (key in body) allowed[key] = body[key];
  }
  allowed.updatedAt = new Date();

  const leads = await Leads();
  const lead = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });

  let sendError: string | null = null;
  let sendNote: string | null = null;
  if (body.status === "approved") {
    if (lead?.email) {
      const session = await auth();
      try {
        await sendGmail(result.userId, {
          to: lead.email,
          from: session?.user?.email ?? "me",
          subject: lead.subject || `Following up, ${lead.name}`,
          body: allowed.draft as string | undefined ?? lead.draft,
        });
        allowed.status = "sent";
      } catch (err) {
        sendError = err instanceof Error ? err.message : "Gmail send failed.";
      }
    } else {
      sendNote = `No email on file for ${lead?.name ?? "this lead"} — nothing was sent automatically. Copy the draft above and reach out via ${lead?.source ?? "their source"} yourself.`;
    }
  }

  await leads.updateOne({ _id: new ObjectId(id), userId: result.userId }, { $set: allowed });

  // Only count toward the daily send cap when a message actually went out — approving a lead
  // with no known email doesn't send anything, so it shouldn't inflate "sent today".
  if (allowed.status === "sent") {
    const campaigns = await Campaigns();
    await campaigns.updateOne({ userId: result.userId }, { $inc: { "stats.sentToday": 1 } });
  }

  const updated = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });
  return NextResponse.json({ ...updated, sendError, sendNote });
}

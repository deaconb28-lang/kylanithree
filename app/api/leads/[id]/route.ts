import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns, Leads, Suppressions } from "@/lib/collections";
import { sendGmail } from "@/lib/gmail";
import { toUserError } from "@/lib/apiError";
import { signUnsubscribeToken } from "@/lib/unsubscribeToken";
import { SUPPRESSION_REASON_LABELS } from "@/lib/suppression";

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
    // Suppression is checked before anything sends, not after — real record, see lib/collections.ts.
    const blocked = lead?.email
      ? await (await Suppressions()).findOne({ userId: result.userId, email: lead.email })
      : null;
    if (blocked) {
      allowed.status = "dropped";
      sendNote = `${lead?.name ?? "This contact"} is suppressed (${SUPPRESSION_REASON_LABELS[blocked.reason]}) — nothing was sent.`;
    } else if (lead?.email) {
      const session = await auth();
      try {
        const unsubscribeUrl = `${req.nextUrl.origin}/api/unsubscribe?token=${signUnsubscribeToken(id)}`;
        const draftBody = (allowed.draft as string | undefined) ?? lead.draft;
        await sendGmail(result.userId, {
          to: lead.email,
          from: session?.user?.email ?? "me",
          subject: lead.subject || `Following up, ${lead.name}`,
          body: `${draftBody}\n\n—\nDon't want to hear from me again? ${unsubscribeUrl}`,
        });
        allowed.status = "sent";
      } catch (err) {
        sendError = toUserError(
          "leads/send",
          err,
          "Couldn't send that automatically. The draft is saved above — copy it and send it yourself, or try approving it again in a bit.",
        );
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

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns, Leads } from "@/lib/collections";
import { sendGmail } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { hypothesisKey } = await req.json();

  const leads = await Leads();
  const filter = { userId: result.userId, status: "waiting" as const, ...(hypothesisKey ? { hypothesisKey } : {}) };
  const matching = await leads.find(filter).toArray();

  const session = await auth();
  const fromEmail = session?.user?.email ?? "me";
  let sent = 0;
  let failed = 0;

  for (const lead of matching) {
    if (lead.email) {
      try {
        await sendGmail(result.userId, {
          to: lead.email,
          from: fromEmail,
          subject: lead.subject || `Following up, ${lead.name}`,
          body: lead.draft,
        });
        await leads.updateOne({ _id: lead._id }, { $set: { status: "sent", updatedAt: new Date() } });
        sent += 1;
        continue;
      } catch {
        failed += 1;
      }
    }
    await leads.updateOne({ _id: lead._id }, { $set: { status: "approved", updatedAt: new Date() } });
  }

  if (sent > 0) {
    const campaigns = await Campaigns();
    await campaigns.updateOne({ userId: result.userId }, { $inc: { "stats.sentToday": sent } });
  }

  return NextResponse.json({ approved: matching.length, sent, failed });
}

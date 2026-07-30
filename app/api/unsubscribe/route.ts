import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Leads, Suppressions } from "@/lib/collections";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

function page(title: string, body: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FDFCFA;font-family:system-ui,sans-serif;color:#14120F;"><div style="max-width:420px;text-align:center;padding:24px;"><h1 style="font-size:24px;margin:0 0 12px;font-weight:800;">${title}</h1><p style="font-size:15px;color:#6B655D;line-height:1.6;margin:0;">${body}</p></div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Public, unauthenticated — reached by clicking the unsubscribe link in a sent email, not from
// inside the app. Real suppression: recorded once and checked before any future send to this
// contact (see the suppression check in app/api/leads/[id]/route.ts).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const leadId = verifyUnsubscribeToken(token);
  if (!leadId || !ObjectId.isValid(leadId)) {
    return page("That link isn't valid.", "It may be expired or mistyped — no changes were made.");
  }

  const leads = await Leads();
  const lead = await leads.findOne({ _id: new ObjectId(leadId) });
  if (!lead) {
    return page("That contact couldn't be found.", "No changes were made.");
  }

  const suppressions = await Suppressions();
  await suppressions.updateOne(
    { userId: lead.userId, campaignId: lead.campaignId, reason: "unsubscribed", leadId },
    {
      $setOnInsert: {
        userId: lead.userId,
        campaignId: lead.campaignId,
        name: lead.name,
        role: lead.role,
        email: lead.email ?? null,
        reason: "unsubscribed",
        where: `Was matched via ${lead.source}`,
        leadId,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  return page("You're unsubscribed.", "You won't hear from this sender again through Kylani.");
}

import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns } from "@/lib/collections";
import { deleteCampaign } from "@/lib/account/reset";
import { toUserError } from "@/lib/apiError";

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  return NextResponse.json(result.campaign);
}

export async function PATCH(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  for (const key of ["whatYouSell", "dailyCap", "paused", "channels", "productUrl"]) {
    if (key in body) allowed[key] = body[key];
  }
  allowed.updatedAt = new Date();

  const campaigns = await Campaigns();
  await campaigns.updateOne({ userId: result.userId }, { $set: allowed });
  const updated = await campaigns.findOne({ userId: result.userId });
  return NextResponse.json(updated);
}

/**
 * Delete this campaign and everything derived from it, so the founder can start over.
 *
 * The caller must send back the campaign's own product name. That is not decoration: this is
 * irreversible and takes the leads, findings and communities with it, and a button that does that
 * on one click will eventually be pressed by somebody who meant to press the one beside it. The
 * check is server-side as well as in the UI, because a confirmation a client can skip is not one.
 *
 * Suppressions, lead charges, usage events and billing all survive — see lib/account/reset.ts for
 * why each one is kept rather than wiped.
 */
export async function DELETE(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { userId, campaign } = result;

  let confirm: unknown;
  try {
    confirm = (await req.json())?.confirm;
  } catch {
    confirm = undefined;
  }

  // Compared case-insensitively and trimmed. The point is to make somebody read their own product
  // name and type it, not to test their shift key.
  const expected = (campaign.productName ?? "").trim().toLowerCase();
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== expected) {
    return NextResponse.json(
      { error: `Type the campaign name exactly to confirm: ${campaign.productName}` },
      { status: 400 },
    );
  }

  try {
    const outcome = await deleteCampaign(userId);
    console.error(`[campaign] deleted for ${userId}:`, JSON.stringify(outcome));
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    return NextResponse.json(
      { error: toUserError("campaign/delete", err, "Couldn't delete the campaign right now.") },
      { status: 500 },
    );
  }
}

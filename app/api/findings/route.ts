import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Findings } from "@/lib/collections";
import { toUserError } from "@/lib/apiError";

export async function GET() {
  try {
    const result = await requireCampaign();
    if ("error" in result) return result.error;
    const findings = await Findings();
    const docs = await findings.find({ userId: result.userId }).sort({ createdAt: 1 }).toArray();
    return NextResponse.json({ findings: docs, stats: result.campaign.stats });
  } catch (err) {
    const message = toUserError(
      "findings",
      err,
      "Couldn't load your findings right now. Try refreshing — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads } from "@/lib/collections";

export async function GET(req: NextRequest) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;

  const scope = req.nextUrl.searchParams.get("scope");
  const leads = await Leads();
  const filter: Record<string, unknown> = { userId: result.userId };
  if (scope === "today") filter.timeSensitive = true;
  if (scope === "queue") filter.timeSensitive = false;

  // Best first. scoreTotal descending puts the strongest signal at the top of the queue; createdAt
  // only breaks ties and keeps ordering stable for older leads written before scoring existed.
  const docs = await leads.find(filter).sort({ scoreTotal: -1, createdAt: 1 }).toArray();
  return NextResponse.json(docs);
}

import { NextRequest, NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads } from "@/lib/collections";
import { demotionFor, rejectionSignal } from "@/lib/leads/rejections";

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

  // Then re-ranked by what this founder has already rejected, which is what closes the relevance
  // loop: tapping "wrong role" four times on one community has to visibly change what comes next,
  // or the reason chooser is just a slower delete button.
  //
  // Applied at read time rather than written back onto the lead. The signal changes with every
  // rejection, so a stored score would be stale the moment the next one lands, and re-scoring every
  // lead on every tap is a write amplification nobody needs. Sorting a few hundred rows is free.
  const campaignId = docs[0]?.campaignId;
  if (!campaignId) return NextResponse.json(docs);

  const signal = await rejectionSignal(result.userId, campaignId);
  if (signal.total === 0) return NextResponse.json(docs);

  const ranked = docs
    .map((d) => ({ doc: d, weight: demotionFor(d, signal) }))
    .sort((a, b) => {
      const av = (a.doc.scoreTotal ?? 0) * a.weight;
      const bv = (b.doc.scoreTotal ?? 0) * b.weight;
      return bv - av;
    })
    .map((r) => r.doc);

  return NextResponse.json(ranked);
}

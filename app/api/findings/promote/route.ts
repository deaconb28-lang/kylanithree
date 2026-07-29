import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Hypotheses } from "@/lib/collections";

export async function POST() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;

  const hypotheses = await Hypotheses();
  const all = await hypotheses.find({ userId: result.userId }).toArray();

  // Promote whichever hypothesis has the best numeric reply rate — there's nothing to promote
  // based on until enough real replies have come in to give at least two of them a real number.
  const withRate = all
    .map((h) => ({ h, rateNum: parseFloat(h.rate) }))
    .filter(({ rateNum }) => !Number.isNaN(rateNum));
  const currentPrimary = all.find((h) => h.status === "primary");

  if (withRate.length >= 2) {
    const best = withRate.reduce((a, b) => (b.rateNum > a.rateNum ? b : a)).h;
    if (best.key !== currentPrimary?.key) {
      if (currentPrimary) {
        await hypotheses.updateOne({ userId: result.userId, key: currentPrimary.key }, { $set: { status: "learning", updatedAt: new Date() } });
      }
      await hypotheses.updateOne({ userId: result.userId, key: best.key }, { $set: { status: "primary", updatedAt: new Date() } });
    }
  }

  const updated = await hypotheses.find({ userId: result.userId }).toArray();
  return NextResponse.json(updated);
}

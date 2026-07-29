import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Hypotheses } from "@/lib/collections";
import { toUserError } from "@/lib/apiError";

export async function GET() {
  try {
    const result = await requireCampaign();
    if ("error" in result) return result.error;
    const hypotheses = await Hypotheses();
    const docs = await hypotheses.find({ userId: result.userId }).toArray();
    return NextResponse.json(docs);
  } catch (err) {
    const message = toUserError(
      "hypotheses",
      err,
      "Couldn't load your findings right now. Try refreshing — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

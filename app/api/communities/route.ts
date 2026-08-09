import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Communities } from "@/lib/collections";
import { toUserError } from "@/lib/apiError";

export async function GET() {
  try {
    const result = await requireCampaign();
    if ("error" in result) return result.error;
    const communities = await Communities();
    const docs = await communities.find({ userId: result.userId }).toArray();
    return NextResponse.json(docs);
  } catch (err) {
    const message = toUserError(
      "communities",
      err,
      "Couldn't load your communities right now. Try refreshing — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

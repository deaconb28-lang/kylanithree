import { NextRequest, NextResponse } from "next/server";
import { extractLeads } from "@/lib/search/extract";
import { lexiconFrom } from "@/lib/generateCampaignSeed";
import { Trace } from "@/lib/search/trace";
import { toUserError } from "@/lib/apiError";
import type { Venue } from "@/lib/search/types";

// Stages 2-4 for ONE shard of venues. The client fires several of these in parallel and renders
// each batch as it lands, which is what produces streaming results without SSE — and keeps every
// individual request comfortably inside Vercel's function ceiling rather than racing it.
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.whatYouSell || !Array.isArray(body.buyers) || !Array.isArray(body.venues)) {
    return NextResponse.json({ error: "Incomplete search data." }, { status: 400 });
  }

  const venues = body.venues as Venue[];
  if (venues.length === 0) return NextResponse.json({ leads: [], runId: null });

  const trace = new Trace(body.runId);
  try {
    const { leads } = await extractLeads({
      venues,
      lexicon: lexiconFrom(body),
      whatYouSell: body.whatYouSell,
      problem: body.problem ?? body.whatYouSell,
      buyers: body.buyers,
      trace,
      maxLeads: body.maxLeads ?? 25,
      // Which wave of the widening search this request represents, and who has already been
      // shipped — so a later wave spends its budget finding new people rather than re-scoring
      // the ones the founder can already see.
      wave: typeof body.wave === "number" ? body.wave : 0,
      excludeAuthors: Array.isArray(body.excludeAuthors) ? body.excludeAuthors : [],
    });
    trace.log("onboarding/extract-leads");
    return NextResponse.json({ leads, trace: trace.toJSON() });
  } catch (err) {
    trace.log("onboarding/extract-leads");
    const message = toUserError(
      "onboarding/extract-leads",
      err,
      "Couldn't search for real leads right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

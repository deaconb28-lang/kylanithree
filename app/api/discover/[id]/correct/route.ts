import { NextRequest, NextResponse } from "next/server";
import { Searches } from "@/lib/discover/collections";
import { fastAnalyze } from "@/lib/discover/fastAnalyze";
import { rerank } from "@/lib/discover/rerank";
import { track } from "@/lib/discover/analytics";
import { toUserError } from "@/lib/apiError";

// Correcting a wrong inference.
//
// One click, results re-rank live, the flow does not restart. That constraint is what makes the
// inference safe to show at all: a guess you can fix in place costs a second, a guess that gates
// the next step costs the whole session.
//
// Two things happen. The corrected description is re-read for the words a sufferer would actually
// type, and the leads already on screen are re-ordered against those words. If the run is still in
// flight the stream picks the new keywords up at its next shard boundary, so the correction steers
// the rest of the search too rather than only relabelling what it already found.
export const maxDuration = 20;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: searchId } = await ctx.params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      anonId?: string;
      field?: string;
      from?: string;
      to?: string;
    };

    const to = body.to?.trim();
    if (!to) return NextResponse.json({ error: "Tell me what it actually is and I'll search again." }, { status: 400 });

    const searches = await Searches();
    const search = await searches.findOne({ searchId });
    if (!search) return NextResponse.json({ error: "That search has expired. Start a new one." }, { status: 404 });

    // Re-derive the search words from the correction. A failure here is not worth failing the call
    // over — the correction still stands as the description, the old keywords keep working, and the
    // person is no worse off than before they typed it.
    let fast = search.fast;
    try {
      const next = await fastAnalyze({ sentence: to, timeoutMs: 8000 });
      fast = { ...next, whatYouSell: to };
    } catch (err) {
      console.error("[discover] re-analysis after correction failed:", err instanceof Error ? err.message : err);
      if (fast) fast = { ...fast, whatYouSell: to };
    }

    const leads = fast ? rerank(search.leads, fast.keywords) : search.leads;

    await searches.updateOne(
      { searchId },
      {
        $set: { fast, leads, correctedAt: new Date() },
        $push: {
          corrections: { field: body.field ?? "whatYouSell", from: body.from ?? search.fast?.whatYouSell ?? "", to, at: new Date() },
        },
      },
    );

    if (body.anonId) {
      await track({ anonId: body.anonId, name: "inference_corrected", flow: "discover", searchId, props: { field: body.field ?? "whatYouSell" } });
    }

    return NextResponse.json({ fast, leads });
  } catch (err) {
    const message = toUserError("discover/correct", err, "Couldn't apply that correction. Try again in a moment.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

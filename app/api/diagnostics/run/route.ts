import { NextRequest, NextResponse } from "next/server";
import { resolveVenues } from "@/lib/search/venues";
import { extractLeads } from "@/lib/search/extract";
import { lexiconFrom, nicheKeyFrom } from "@/lib/generateCampaignSeed";
import { Trace } from "@/lib/search/trace";
import { toUserError } from "@/lib/apiError";

// Runs the real pipeline against a fixed, known-good niche and returns the full trace.
//
// The point is to separate "the search is broken" from "this particular niche is quiet". Reading a
// per-stage trace for a niche that definitely has public discussion tells you immediately whether
// candidates are being found and dropped, or never found at all — and how long each stage took,
// which is the number that matters when a function is being killed by the platform.
export const maxDuration = 60;

const SAMPLE = {
  whatYouSell: "A tool that replaces messy spreadsheets for small teams.",
  problem: "Teams outgrow spreadsheets and lose track of work.",
  buyers: [{ name: "Operations manager", desc: "Runs day-to-day process at a small company and owns the spreadsheets." }],
  channels: { reddit: true, forums: true },
  nicheKey: "spreadsheet-replacement-smallteam",
  problemPhrases: ["spreadsheet keeps breaking", "outgrown our spreadsheet", "tracking work in spreadsheets"],
  seekingPhrases: ["spreadsheet alternative", "project tracking tool", "replace our spreadsheet"],
  negativeTerms: ["book a demo", "sponsored"],
  relevanceWindowDays: 90,
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input = { ...SAMPLE, ...body, url: body.url ?? "example.com" };
  const trace = new Trace();
  const startedAt = Date.now();

  try {
    const lexicon = lexiconFrom(input);
    const { venues, cached } = await resolveVenues({
      nicheKey: nicheKeyFrom(input),
      buyers: input.buyers,
      whatYouSell: input.whatYouSell,
      lexiconTerms: [...lexicon.seekingPhrases, ...lexicon.problemPhrases],
      trace,
    });

    const searchable = venues.filter((v) => v.searchable);
    let leads: Awaited<ReturnType<typeof extractLeads>>["leads"] = [];
    if (searchable.length > 0) {
      // One shard, one wave — enough to prove the path end to end without risking the ceiling.
      const result = await extractLeads({
        venues: searchable.slice(0, 3),
        lexicon,
        whatYouSell: input.whatYouSell,
        problem: input.problem,
        buyers: input.buyers,
        trace,
      });
      leads = result.leads;
    }

    trace.log("diagnostics/run");
    return NextResponse.json({
      ok: true,
      totalMs: Date.now() - startedAt,
      venuesResolved: venues.length,
      venuesSearchable: searchable.length,
      venueNames: venues.map((v) => `${v.name}${v.searchable ? "" : " (not searchable)"}`),
      cachedVenues: cached,
      leadsFound: leads.length,
      sampleLeads: leads.slice(0, 3).map((l) => ({
        author: l.author,
        venue: l.venueName,
        intent: l.intentTier,
        permalink: l.permalink,
        excerpt: l.excerpt.slice(0, 140),
      })),
      trace: trace.toJSON(),
    });
  } catch (err) {
    trace.log("diagnostics/run");
    return NextResponse.json(
      {
        ok: false,
        totalMs: Date.now() - startedAt,
        error: toUserError("diagnostics/run", err, "The test run failed."),
        // Unlike a customer-facing route, the raw message is the entire point here.
        detail: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        trace: trace.toJSON(),
      },
      { status: 200 },
    );
  }
}

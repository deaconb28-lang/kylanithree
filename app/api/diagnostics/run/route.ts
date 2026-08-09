import { NextRequest, NextResponse } from "next/server";
import { resolveVenues } from "@/lib/search/venues";
import { extractLeads } from "@/lib/search/extract";
import { lexiconFrom, nicheKeyFrom } from "@/lib/generateCampaignSeed";
import { Trace } from "@/lib/search/trace";
import { Deadline } from "@/lib/search/deadline";
import { toUserError } from "@/lib/apiError";

// Runs the real pipeline against a fixed, known-good niche and returns the full trace.
//
// The point is to separate "the search is broken" from "this particular niche is quiet". Reading a
// per-stage trace for a niche that definitely has public discussion tells you immediately whether
// candidates are being found and dropped, or never found at all — and how long each stage took,
// which is the number that matters when a function is being killed by the platform.
export const maxDuration = 60;

// Well under maxDuration. Vercel kills the function AT the ceiling and sends nothing back, so a run
// that aims for 60s reports 504 and takes its own trace down with it — which is exactly what
// production was doing. Finishing at 45s with partial results and a readable trace is strictly more
// useful than a complete run that never arrives.
const RUN_BUDGET_MS = 45_000;

const SAMPLE = {
  whatYouSell: "A tool that replaces messy spreadsheets for small teams.",
  problem: "Teams outgrow spreadsheets and lose track of work.",
  buyers: [{ name: "Operations manager", desc: "Runs day-to-day process at a small company and owns the spreadsheets." }],
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
  const deadline = new Deadline(RUN_BUDGET_MS);

  try {
    const lexicon = lexiconFrom(input);
    const { venues, cached } = await resolveVenues({
      nicheKey: nicheKeyFrom(input),
      buyers: input.buyers,
      whatYouSell: input.whatYouSell,
      lexiconTerms: [...lexicon.seekingPhrases, ...lexicon.problemPhrases],
      trace,
      deadline,
    });

    const searchable = venues.filter((v) => v.searchable);
    let leads: Awaited<ReturnType<typeof extractLeads>>["leads"] = [];
    let skipped: string | null = null;

    if (searchable.length === 0) {
      skipped = "No searchable venue was resolved, so there was nothing to search inside.";
    } else if (deadline.expired()) {
      skipped = `Phase 1 used the whole ${RUN_BUDGET_MS / 1000}s budget — extraction never started.`;
    } else {
      // One shard, one wave — enough to prove the path end to end without risking the ceiling.
      const result = await extractLeads({
        venues: searchable.slice(0, 3),
        lexicon,
        whatYouSell: input.whatYouSell,
        problem: input.problem,
        buyers: input.buyers,
        trace,
        deadline,
      });
      leads = result.leads;
    }

    trace.log("diagnostics/run");
    return NextResponse.json({
      ok: true,
      totalMs: deadline.elapsed(),
      budgetMs: RUN_BUDGET_MS,
      hitBudget: deadline.expired(),
      skipped,
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
        totalMs: deadline.elapsed(),
        budgetMs: RUN_BUDGET_MS,
        hitBudget: deadline.expired(),
        error: toUserError("diagnostics/run", err, "The test run failed."),
        // Unlike a customer-facing route, the raw message is the entire point here.
        detail: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        trace: trace.toJSON(),
      },
      { status: 200 },
    );
  }
}

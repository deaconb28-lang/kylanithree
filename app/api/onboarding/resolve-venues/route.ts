import { NextRequest, NextResponse } from "next/server";
import { resolveVenues } from "@/lib/search/venues";
import { lexiconFrom, nicheKeyFrom } from "@/lib/generateCampaignSeed";
import { Trace } from "@/lib/search/trace";
import { Deadline } from "@/lib/search/deadline";
import { redditAuthMode } from "@/lib/search/reddit";
import { toUserError } from "@/lib/apiError";

// Stage 1 only. Small and fast by design: subreddit discovery is a handful of parallel API calls
// plus one short model pass to prune and annotate, so this returns well inside the budget and the
// founder sees real communities on screen before lead extraction has even started.
export const maxDuration = 60;

// Under the platform ceiling on purpose. A function killed AT the ceiling sends no response at all,
// so the browser reports a connection failure and the trace is lost — the run has to finish itself.
const RUN_BUDGET_MS = 40_000;

// Unauthenticated: onboarding runs before sign-in.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.whatYouSell || !Array.isArray(body.buyers) || body.buyers.length === 0) {
    return NextResponse.json({ error: "Incomplete onboarding data." }, { status: 400 });
  }

  const trace = new Trace();
  const deadline = new Deadline(RUN_BUDGET_MS);
  try {
    const lexicon = lexiconFrom(body);
    const { venues, cached } = await resolveVenues({
      nicheKey: nicheKeyFrom(body),
      buyers: body.buyers,
      whatYouSell: body.whatYouSell,
      lexiconTerms: [...lexicon.seekingPhrases, ...lexicon.problemPhrases],
      trace,
      deadline,
    });
    trace.record({ stage: "reddit:auth", candidatesIn: 0, candidatesOut: 0, ms: 0, note: redditAuthMode() });
    trace.log("onboarding/resolve-venues");
    return NextResponse.json({ venues, cached, runId: trace.runId, trace: trace.toJSON() });
  } catch (err) {
    trace.log("onboarding/resolve-venues");
    const message = toUserError(
      "onboarding/resolve-venues",
      err,
      "Couldn't work out where your buyers gather right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

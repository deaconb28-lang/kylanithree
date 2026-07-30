import { NextRequest, NextResponse } from "next/server";
import { generateCampaignSeed } from "@/lib/generateCampaignSeed";
import { toUserError } from "@/lib/apiError";

// 60s is the real ceiling on Vercel's Hobby plan even with Fluid Compute enabled — see
// onboarding/finalize/route.ts for the full explanation. generateCampaignSeed's search is budgeted
// (a handful of searches, low effort) specifically to fit inside this window.
export const maxDuration = 60;

// Intentionally unauthenticated: this runs during onboarding's Step5Search, before sign-in. It's
// the real lead-finding search architecture (web_search-backed, see generateCampaignSeed) — kicked
// off here so the founder watches an honest, real-time-ticking wait instead of a scripted
// animation, and finalizeOnboarding (post-signin) just persists whatever this already found
// instead of searching a second time.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.url || !body.whatYouSell || !Array.isArray(body.buyers) || !body.channels) {
    return NextResponse.json({ error: "Incomplete onboarding data." }, { status: 400 });
  }

  try {
    const seed = await generateCampaignSeed({
      url: body.url,
      whatYouSell: body.whatYouSell,
      buyers: body.buyers,
      channels: body.channels,
      category: body.category,
      keywords: body.keywords,
    });
    return NextResponse.json(seed);
  } catch (err) {
    const message = toUserError(
      "onboarding/search",
      err,
      "Couldn't search for real leads right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { searchCommunities } from "@/lib/generateCampaignSeed";
import { toUserError } from "@/lib/apiError";

// Phase 1 of the real lead search, split into its own request so it gets a fresh ~60s Vercel
// budget instead of sharing one with the (larger, slower) people search — see
// generateCampaignSeed.ts for why. Intentionally unauthenticated, same as the old combined route:
// this runs during onboarding's Step5Search, before sign-in.
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.url || !body.whatYouSell || !Array.isArray(body.buyers) || !body.channels) {
    return NextResponse.json({ error: "Incomplete onboarding data." }, { status: 400 });
  }

  try {
    const result = await searchCommunities({
      url: body.url,
      whatYouSell: body.whatYouSell,
      buyers: body.buyers,
      channels: body.channels,
      category: body.category,
      keywords: body.keywords,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = toUserError(
      "onboarding/search-communities",
      err,
      "Couldn't search for real communities right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

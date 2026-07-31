import { NextRequest, NextResponse } from "next/server";
import { searchPeople } from "@/lib/generateCampaignSeed";
import { toUserError } from "@/lib/apiError";

// Phase 2 of the real lead search — see search-communities/route.ts and generateCampaignSeed.ts
// for why this is its own request rather than a continuation of the same call.
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.url || !body.whatYouSell || !Array.isArray(body.buyers) || !body.channels || !Array.isArray(body.communities)) {
    return NextResponse.json({ error: "Incomplete onboarding data." }, { status: 400 });
  }

  try {
    const result = await searchPeople({
      url: body.url,
      whatYouSell: body.whatYouSell,
      buyers: body.buyers,
      channels: body.channels,
      category: body.category,
      keywords: body.keywords,
      communities: body.communities,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = toUserError(
      "onboarding/search-people",
      err,
      "Couldn't search for real leads right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

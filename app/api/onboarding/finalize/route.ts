import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { toUserError } from "@/lib/apiError";
import { finalizeOnboarding, type OnboardingAnswers } from "@/lib/seed";

// 60s is the real ceiling on Vercel's Hobby plan even with Fluid Compute enabled (Pro/Enterprise
// allow more) — setting this higher doesn't buy more time on Hobby, it risks the function (or the
// whole deploy) failing outright instead of just running long. generateCampaignSeed's search is
// budgeted (a handful of searches, low effort) specifically to fit inside this window.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  const body = (await req.json()) as Partial<OnboardingAnswers>;
  if (!body.url || !body.whatYouSell || !Array.isArray(body.buyers) || !body.channels) {
    return NextResponse.json({ error: "Incomplete onboarding data." }, { status: 400 });
  }

  try {
    const campaign = await finalizeOnboarding(userId, {
      url: body.url,
      whatYouSell: body.whatYouSell,
      buyers: body.buyers,
      channels: body.channels,
      category: body.category,
      keywords: body.keywords,
      seed: body.seed,
    });
    return NextResponse.json(campaign);
  } catch (err) {
    // Nothing is written to the DB unless generation succeeds (see finalizeOnboarding), so a
    // failure here leaves no partial campaign behind — safe to retry.
    const message = toUserError(
      "onboarding/finalize",
      err,
      "Couldn't build your campaign right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

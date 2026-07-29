import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { toUserError } from "@/lib/apiError";
import { finalizeOnboarding, type OnboardingAnswers } from "@/lib/seed";

// Real web search across several platforms (see generateCampaignSeed) takes longer than the old
// invent-from-a-prompt call did — give it real headroom. Requires Fluid Compute on Vercel to take
// effect at all (see HANDOFF.md); without it this still caps at the platform default.
export const maxDuration = 180;

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

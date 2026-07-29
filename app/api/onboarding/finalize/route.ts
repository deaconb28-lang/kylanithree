import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { finalizeOnboarding, type OnboardingAnswers } from "@/lib/seed";

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
    });
    return NextResponse.json(campaign);
  } catch (err) {
    // Nothing is written to the DB unless generation succeeds (see finalizeOnboarding), so a
    // failure here leaves no partial campaign behind — safe to retry. Surface the real cause
    // (e.g. a missing ANTHROPIC_API_KEY) instead of an opaque 500.
    const message = err instanceof Error ? err.message : "Couldn't build your campaign.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

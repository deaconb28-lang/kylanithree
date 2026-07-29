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

  const campaign = await finalizeOnboarding(userId, {
    url: body.url,
    whatYouSell: body.whatYouSell,
    buyers: body.buyers,
    channels: body.channels,
  });

  return NextResponse.json(campaign);
}

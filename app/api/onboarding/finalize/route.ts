import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUserId } from "@/lib/apiAuth";
import { toUserError } from "@/lib/apiError";
import { finalizeOnboarding, type OnboardingAnswers } from "@/lib/seed";
import { sendOnboardingSummaryEmail } from "@/lib/onboardingSummaryEmail";

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
    const { campaign, isNew } = await finalizeOnboarding(userId, {
      url: body.url,
      whatYouSell: body.whatYouSell,
      buyers: body.buyers,
      channels: body.channels,
      category: body.category,
      keywords: body.keywords,
      seed: body.seed,
    });

    // Best-effort — a failed or unconfigured send should never fail onboarding itself, since the
    // campaign is already built by this point. Only sent once, on the actual creation (not a
    // retried/duplicate finalize call hitting the early-return in finalizeOnboarding).
    if (isNew && campaign) {
      const session = await auth();
      const to = session?.user?.email;
      if (to) {
        sendOnboardingSummaryEmail({
          to,
          productName: campaign.productName,
          productUrl: campaign.productUrl,
          buyers: body.buyers,
          leadsCount: campaign.stats.buyersTotal,
          communitiesCount: campaign.stats.communitiesTotal,
          appUrl: req.nextUrl.origin,
        }).catch((err) => {
          console.error("[onboarding/finalize] Summary email failed:", err instanceof Error ? err.message : err);
        });
      }
    }

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

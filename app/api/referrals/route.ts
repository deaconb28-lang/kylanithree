import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { ensureReferralCode, referralSummary, REFERRAL_REWARD_CENTS } from "@/lib/referrals";
import { PLAN } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * A referrer's own code, link and standing.
 *
 * `ensureReferralCode` is called on read, not just at signup — that is what backfills anyone who
 * created their account before the program existed. Opening the panel is what makes their code
 * resolvable, so no migration is needed for the accounts that already exist.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  const code = await ensureReferralCode(userId);
  const summary = await referralSummary(userId);

  return NextResponse.json({
    ...summary,
    code,
    link: `${req.nextUrl.origin}/?r=${code}`,
    rewardCents: REFERRAL_REWARD_CENTS,
    currency: PLAN.currency,
  });
}

import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Campaigns, Communities, Hypotheses, Leads } from "@/lib/collections";
import { generateCampaignSeed } from "@/lib/generateCampaignSeed";
import { persistGeneratedSeed } from "@/lib/seed";
import { toUserError } from "@/lib/apiError";

// Same real-search architecture as onboarding, run again against an existing campaign — for an
// account whose first search came back sparse or empty, real leads aren't invented after the
// fact, but the founder can ask Kylani to actually look again.
export const maxDuration = 60;

export async function POST() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { userId, campaign } = result;
  const cid = campaign._id.toString();

  try {
    const [hypotheses, existingLeads, existingCommunities] = await Promise.all([
      (await Hypotheses()).find({ userId }).sort({ status: 1 }).toArray(),
      (await Leads()).find({ userId }).toArray(),
      (await Communities()).find({ userId }).toArray(),
    ]);

    if (hypotheses.length === 0) {
      return NextResponse.json({ error: "No buyer personas on this campaign yet — nothing to search for." }, { status: 400 });
    }

    // Primary hypothesis first, matching the original buyerIndex 0 = "most likely" convention.
    const ordered = [...hypotheses].sort((a, b) => (a.status === "primary" ? -1 : b.status === "primary" ? 1 : 0));
    const buyers = ordered.map((h) => ({ name: h.name, desc: h.meta }));

    const generated = await generateCampaignSeed({
      url: campaign.productUrl,
      whatYouSell: campaign.whatYouSell,
      problem: campaign.problem,
      buyers,
      channels: campaign.channels,
      keywords: campaign.keywords,
      nicheKey: campaign.nicheKey,
      problemPhrases: campaign.problemPhrases,
      seekingPhrases: campaign.seekingPhrases,
      negativeTerms: campaign.negativeTerms,
      relevanceWindowDays: campaign.relevanceWindowDays,
    });

    // Author-keyed, matching persistGeneratedSeed — a re-search that re-finds the same person in a
    // different thread must not create a second lead for them.
    const dedupe = {
      authors: new Set(existingLeads.map((l) => (l.authorHandle ?? l.name).toLowerCase())),
      communityNames: new Set(existingCommunities.map((c) => c.name)),
    };

    const { insertedLeads, insertedCommunities } = await persistGeneratedSeed({
      userId,
      campaignId: cid,
      buyers,
      generated,
      dedupe,
    });

    if (insertedLeads > 0 || insertedCommunities > 0) {
      const campaigns = await Campaigns();
      await campaigns.updateOne(
        { userId },
        { $inc: { "stats.buyersTotal": insertedLeads, "stats.communitiesTotal": insertedCommunities }, $set: { updatedAt: new Date() } },
      );
    }

    return NextResponse.json({ insertedLeads, insertedCommunities });
  } catch (err) {
    const message = toUserError(
      "campaign/search",
      err,
      "Couldn't search for real leads right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads, Hypotheses, Communities } from "@/lib/collections";
import { buildFunnel } from "@/lib/campaign/funnel";
import { daysToConvert } from "@/lib/campaign/funnel";
import { stageOf, type CampaignPerson } from "@/lib/campaign/types";
import { recentWork, digestSince } from "@/lib/campaign/worklog";
import { planBetween, hasAnyPlan, weekStart } from "@/lib/campaign/plan";
import { toUserError } from "@/lib/apiError";

export const runtime = "nodejs";

// One request for the whole dashboard.
//
// The alternative — a fetch per module — was rejected for a reason the acceptance criteria make
// explicit: the spine, the stage workspaces and the cohort table must agree. Four endpoints reading
// the `leads` collection at four different instants can disagree by whatever moved in between, and
// the disagreement would be intermittent, which is the worst kind. One read, one derivation.
//
// It also matters for the criterion that lens and stage switching "feel instant": everything the
// dashboard can show is already in the client after this single call, so switching is a render, not
// a round trip.
//
// NOTHING IS FABRICATED WHEN A COLLECTION IS EMPTY. A new account gets zeroes, empty arrays and
// `neverRun: true` — not a seeded scenario. The empty states are the product for that account.

export async function GET() {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { userId, campaign } = result;

  try {
    const leadsCol = await Leads();

    // Everything, in one pass. Capped because the funnel is a summary — an account with more than
    // this many leads gets a correct-but-truncated board rather than a slow one, and the cap is far
    // above what any real campaign has held.
    const rows = await leadsCol
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(2000)
      .toArray();

    const funnel = buildFunnel(
      rows.map((l) => ({ status: l.status, firstSeenAt: l.createdAt, updatedAt: l.updatedAt })),
    );

    const people: CampaignPerson[] = [];
    for (const l of rows) {
      const stage = stageOf(l.status);
      if (!stage) continue; // dropped: out of the funnel, out of every view built from it
      people.push({
        id: l._id.toString(),
        name: l.name,
        // Only when it adds something. `displayName` falls back to the login on most platforms, so
        // printing both renders the same string twice.
        handle: l.authorHandle && l.authorHandle !== l.name ? l.authorHandle : undefined,
        source: l.source,
        permalink: l.permalink ?? l.sourceUrl,
        quote: l.excerpt ?? l.quote,
        // Absent rather than substituted. A summary is Kylani's restatement; falling back to the
        // quote here would attribute the founder's own evidence to the classifier.
        summary: l.detail && l.detail !== (l.excerpt ?? l.quote) ? l.detail : undefined,
        hypothesisKey: l.hypothesisKey,
        intentTier: l.intentTier,
        stars: l.stars,
        scoreTotal: l.scoreTotal,
        status: l.status,
        stage,
        postedAt: l.postedAt?.toISOString(),
        firstSeenAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        daysToConvert:
          l.status === "converted" && l.convertedAt
            ? (daysToConvert(l.createdAt, l.convertedAt) ?? undefined)
            : undefined,
      });
    }

    // The week the board opens on, computed server-side so the first paint is not a flash of the
    // wrong week while the client works out its own timezone.
    const from = weekStart(new Date());
    const to = new Date(from.getTime() + 7 * 86_400_000);

    // Sunday, or the account's creation — whichever is later. A digest that reaches back before the
    // account existed would be reporting on a period it has nothing to say about.
    const digestFrom = new Date(Math.max(from.getTime(), campaign.createdAt.getTime()));

    const [hypotheses, communities, worklog, digest, plan, everPlanned] = await Promise.all([
      (await Hypotheses()).find({ userId }).limit(20).toArray(),
      (await Communities()).find({ userId }).limit(60).toArray(),
      recentWork(userId, 60),
      digestSince(userId, digestFrom),
      planBetween(userId, from, to),
      hasAnyPlan(userId),
    ]);

    return NextResponse.json({
      campaign: {
        productName: campaign.productName,
        productUrl: campaign.productUrl,
        paused: campaign.paused,
        createdAt: campaign.createdAt.toISOString(),
        trialEndsAt: campaign.trialEndsAt?.toISOString() ?? null,
      },
      funnel,
      people,
      hypotheses: hypotheses.map((h) => ({ key: h.key, name: h.name, status: h.status, meta: h.meta })),
      communities: communities.map((c) => ({
        key: c.key,
        name: c.name,
        fit: c.fit,
        // `membersNum` is 0 both for "no members" and "we never resolved a count". Sent as null in
        // the second case so the UI can say "size unknown" instead of claiming an empty community.
        members: c.membersNum > 0 ? c.membersNum : null,
      })),
      worklog,
      digest,
      plan,
      // Distinguishes "no plan has ever existed" from "this week happens to be empty" — two states
      // that need different copy, and the reason this is a boolean rather than `plan.length === 0`.
      everPlanned,
      weekStart: from.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: toUserError("campaign/dashboard", err, "Couldn't load your campaign right now.") },
      { status: 500 },
    );
  }
}

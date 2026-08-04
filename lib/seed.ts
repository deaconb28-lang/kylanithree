import { Campaigns, Communities, Hypotheses, Leads, type CampaignDoc } from "./collections";
import { generateCampaignSeed, type GeneratedSeed } from "./generateCampaignSeed";
import { scoreLead } from "./search/leadScore";
import { CHANNELS } from "./data";
import { meterLeads } from "./credits/meter";
import { ensureCreditIndexes } from "./credits/indexes";
import { restoreBillingOnto } from "./account/reset";

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "buyer";
}

function parseMembersNum(text: string): number {
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*([km]?)/i);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === "k") return Math.round(n * 1_000);
  if (unit === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

function productNameFromUrl(url: string): string {
  const host = url.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
  const label = host.split(".")[0] || host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Shared by finalizeOnboarding (fresh campaign, no dedupe needed) and the "search again" route
// (an existing campaign, where the model may legitimately re-find the same real post — dedupe
// against what's already stored rather than inserting it twice).
export async function persistGeneratedSeed(params: {
  userId: string;
  campaignId: string;
  buyers: { name: string }[];
  generated: GeneratedSeed;
  relevanceWindowDays?: number;
  dedupe?: { authors: Set<string>; communityNames: Set<string> };
  /** Recorded on the usage event so per-account COGS can be read by plan later. */
  plan?: string | null;
}): Promise<{ insertedLeads: number; insertedCommunities: number }> {
  const now = new Date();
  const { userId, campaignId: cid, buyers, generated, dedupe, relevanceWindowDays = 60 } = params;

  // Dedupe by AUTHOR, not by URL — one person is one lead however many posts or venues surfaced
  // them. URL-keyed dedupe let the same person in twice from two different threads.
  const seenAuthors = new Set(dedupe ? [...dedupe.authors].map((a) => a.toLowerCase()) : []);
  const leadsToInsert = generated.leads.filter((l) => {
    const key = l.author.toLowerCase();
    if (seenAuthors.has(key)) return false;
    seenAuthors.add(key);
    return true;
  });
  const communitiesToInsert = dedupe ? generated.communities.filter((c) => !dedupe.communityNames.has(c.name)) : generated.communities;

  if (leadsToInsert.length) {
    const leadsCol = await Leads();
    await leadsCol.insertMany(
      leadsToInsert.map((l) => {
        const buyer = buyers[l.buyerIndex] ?? buyers[0];
        const score = scoreLead({ ...l, relevanceWindowDays });
        return {
          userId,
          campaignId: cid,
          name: l.author,
          role: buyer?.name ?? "Unknown",
          company: l.venueName,
          detail: l.excerpt.slice(0, 90),
          hypothesisKey: slugify(buyer?.name ?? "buyer"),
          source: l.venueName,
          sourceUrl: l.permalink,
          quote: l.excerpt,
          quoteMeta: `${l.numComments} comment${l.numComments === 1 ? "" : "s"} · ${l.score} points`,
          // Written on demand via /api/leads/[id]/draft — deliberately not composed during search.
          subject: "",
          draft: "",
          status: "waiting" as const,
          timeSensitive: l.intentTier === "seeking",
          authorHandle: l.author,
          permalink: l.permalink,
          postedAt: l.postedAt,
          excerpt: l.excerpt,
          intentTier: l.intentTier,
          venueId: l.venueId,
          signalScore: l.confidence,
          stars: score.stars,
          scoreTotal: score.total,
          scoreLabel: score.label,
          scoreBreakdown: score.breakdown,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
  }

  if (communitiesToInsert.length) {
    const communitiesCol = await Communities();
    await communitiesCol.insertMany(
      communitiesToInsert.map((c, i) => ({
        userId,
        campaignId: cid,
        key: `${slugify(c.name)}-${now.getTime()}-${i}`,
        name: c.name,
        mapLabel1: c.name.split("·")[0]?.trim() || c.name,
        mapLabel2: c.platform,
        members: c.membersLabel,
        // Real subscriber count from the platform now, so no string-parsing guesswork.
        membersNum: c.members ?? parseMembersNum(c.membersLabel),
        fit: c.fit,
        reached: "0 reached",
        reachedNum: 0,
        replied: "0 replied",
        repliedNum: 0,
        note: c.note,
        rev: "no pipeline yet",
        updatedAt: now,
      })),
    );
  }

  // Meter what was actually delivered. Recorded on every plan and debited on none yet — see
  // docs/credits.md. Deliberately after the inserts and deliberately unawaited-for-failure: this
  // is bookkeeping, and a search that found real people must never fail because bookkeeping did.
  if (leadsToInsert.length) {
    await ensureCreditIndexes();
    const metered = await meterLeads({
      userId,
      plan: params.plan,
      leads: leadsToInsert.map((l) => ({
        // Search never resolves an email — that is what a contact unlock is for — so every lead
        // from here is basic or standard, never verified. The role comes from the buyer persona
        // the scorer matched, which is exactly what lifts a bare handle to "standard".
        email: null,
        role: buyers[l.buyerIndex]?.name ?? null,
        platform: l.platform ?? null,
        authorHandle: l.author ?? null,
        intentTier: l.intentTier ?? null,
      })),
    });
    console.error(
      `[credits] user=${userId} charged=${metered.charged} credits=${metered.credits} deduped=${metered.deduped} unidentifiable=${metered.unidentifiable}`,
    );
  }

  return { insertedLeads: leadsToInsert.length, insertedCommunities: communitiesToInsert.length };
}

// Onboarding no longer asks where to reach people — every matched channel starts on and the
// founder adjusts it from the real Channels page once they have leads in front of them to adjust
// it for. Owning the default here rather than in the client also means the answer can't arrive
// missing or malformed from a stale session.
const DEFAULT_CHANNELS: Record<string, boolean> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.matched]));

export type OnboardingAnswers = {
  url: string;
  whatYouSell: string;
  problem?: string;
  buyers: { name: string; desc: string }[];
  keywords?: string[];
  // The lexicon from analyze-site — stored on the campaign so a later re-search reuses the same
  // vocabulary and niche cache rather than re-deriving a coarser one from `keywords` alone.
  nicheKey?: string;
  problemPhrases?: string[];
  seekingPhrases?: string[];
  negativeTerms?: string[];
  relevanceWindowDays?: number;
  // Populated when StepSearch already ran the real lead search during onboarding (the normal
  // path) — finalizeOnboarding then just persists it instead of searching a second time. Falls
  // back to searching here itself if a client ever arrives without one (e.g. an old session).
  seed?: GeneratedSeed;
};

// isNew tells the caller whether a campaign was actually just created (vs. a duplicate finalize
// call hitting the early-return below) — used to decide whether to send the onboarding summary
// email exactly once, not on every retry.
export async function finalizeOnboarding(userId: string, onboarding: OnboardingAnswers) {
  const campaigns = await Campaigns();
  const existing = await campaigns.findOne({ userId });
  if (existing) {
    // A genuinely duplicate finalize (the same onboarding POSTed twice) must not re-run the search
    // or double up the leads. But an existing campaign is NOT proof this account already has real
    // data: the old ensureSeeded() wrote a fabricated Dockside campaign the moment any dashboard
    // route loaded, and this branch then updated two fields and threw the real search away — which
    // is exactly how an account ended up permanently stuck on someone else's demo leads.
    //
    // So the test is whether real leads exist, not whether a campaign row exists.
    const leadsCol = await Leads();
    const realLeadCount = await leadsCol.countDocuments({ userId });
    if (realLeadCount > 0) {
      await campaigns.updateOne(
        { userId },
        { $set: { productUrl: onboarding.url, whatYouSell: onboarding.whatYouSell, updatedAt: new Date() } },
      );
      return { campaign: await campaigns.findOne({ userId }), isNew: false };
    }
    // An empty campaign shell — adopt it and fill it in below rather than stranding the founder on
    // a dashboard with their own product name and nobody in it.
    await campaigns.deleteOne({ userId });
  }

  const now = new Date();
  const generated = onboarding.seed ?? (await generateCampaignSeed(onboarding));

  const campaign: CampaignDoc = {
    userId,
    productName: productNameFromUrl(onboarding.url),
    productUrl: onboarding.url,
    whatYouSell: onboarding.whatYouSell,
    dailyCap: 30,
    paused: false,
    revenueBase: 0,
    channels: DEFAULT_CHANNELS,
    keywords: onboarding.keywords,
    problem: onboarding.problem,
    nicheKey: onboarding.nicheKey,
    problemPhrases: onboarding.problemPhrases,
    seekingPhrases: onboarding.seekingPhrases,
    negativeTerms: onboarding.negativeTerms,
    relevanceWindowDays: onboarding.relevanceWindowDays,
    stats: {
      sentToday: 0,
      buyersTotal: generated.leads.length,
      contactedTotal: 0,
      repliedTotal: 0,
      callsBooked: 0,
      communitiesTotal: generated.communities.length,
      weeksActive: 0,
    },
    trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId: campaignId } = await campaigns.insertOne(campaign);
  const cid = campaignId.toString();

  // A previously deleted campaign may have carried a subscription with it. Put it back, or "start
  // fresh" would leave a paying customer reading as unsubscribed while Stripe kept billing them.
  await restoreBillingOnto(userId);

  // generated.leads/communities can legitimately be empty — generateCampaignSeed only returns
  // real, verified search results now rather than a fabricated quota, so a fresh campaign may
  // start with zero of either.
  await persistGeneratedSeed({ userId, campaignId: cid, buyers: onboarding.buyers, generated, relevanceWindowDays: onboarding.relevanceWindowDays });

  const hypothesesCol = await Hypotheses();
  await hypothesesCol.insertMany(
    onboarding.buyers.map((b, i) => ({
      userId,
      campaignId: cid,
      key: slugify(b.name),
      name: b.name,
      rate: "—",
      meta: b.desc,
      status: (i === 0 ? "primary" : "learning") as "primary" | "learning",
      updatedAt: now,
    })),
  );

  return { campaign: await campaigns.findOne({ userId }), isNew: true };
}

import { Campaigns, Communities, Hypotheses, Leads, type CampaignDoc } from "../collections";
import { scoreLead } from "../search/leadScore";
import type { IntentTier } from "../search/types";
import { CHANNELS } from "../data";
import { meterLeads } from "../credits/meter";
import { ensureCreditIndexes } from "../credits/indexes";
import { slugify } from "../seed";
import { Searches, type DiscoverLead, type SearchDoc } from "./collections";

// Turning an anonymous discover run into a real account's campaign.
//
// This is the moment the new flow's whole premise gets paid off: the person already saw the leads,
// so signing in has to hand them exactly those people and nothing else. Anything invented here —
// a padded count, a placeholder engagement stat, a demo lead to fill the screen — would make the
// account contradict the page that convinced them to create it.

const DEFAULT_CHANNELS: Record<string, boolean> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.matched]));

const TIER_OF: Record<string, IntentTier> = {
  switching_away: "seeking",
  seeking_tool: "seeking",
  evaluating_alternatives: "seeking",
  building_workaround: "complaining",
  hiring_for_problem: "seeking",
  describing_pain: "complaining",
};

function productNameFrom(search: SearchDoc): string {
  if (!search.productUrl) return "Your product";
  const host = search.productUrl.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
  const label = host.split(".")[0] || host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function leadDocs(opts: { userId: string; campaignId: string; leads: DiscoverLead[]; buyerName: string }) {
  const now = new Date();
  return opts.leads.map((l) => {
    const intentTier = TIER_OF[l.intentType ?? ""] ?? "adjacent";
    // A pass-1 lead carries no engagement figure, so it scores zero on that component. That is a
    // real absence of evidence rather than a low number we made up, and it costs at most 15 of 100
    // — the lead still ranks on intent, confidence and recency, all of which are measured.
    const score = scoreLead({
      intentTier,
      confidence: l.score,
      postedAt: l.postedAt,
      score: l.engagement?.score ?? 0,
      numComments: l.engagement?.numComments ?? 0,
      relevanceWindowDays: 365,
    });

    return {
      userId: opts.userId,
      campaignId: opts.campaignId,
      name: l.author,
      role: opts.buyerName,
      company: l.venueName,
      detail: l.excerpt.slice(0, 90),
      hypothesisKey: slugify(opts.buyerName),
      source: l.venueName,
      sourceUrl: l.permalink,
      quote: l.excerpt,
      // Left unset rather than "0 comments · 0 points": the discover pipeline does not always know
      // the thread's engagement, and printing zeros would state something we never measured.
      quoteMeta: l.engagement ? `${l.engagement.numComments} comment${l.engagement.numComments === 1 ? "" : "s"} · ${l.engagement.score} points` : undefined,
      subject: "",
      draft: "",
      status: "waiting" as const,
      timeSensitive: intentTier === "seeking",
      authorHandle: l.author,
      permalink: l.permalink,
      postedAt: l.postedAt,
      excerpt: l.excerpt,
      intentTier,
      signalScore: l.score,
      stars: score.stars,
      scoreTotal: score.total,
      scoreLabel: score.label,
      scoreBreakdown: score.breakdown,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export type ClaimResult =
  | { ok: true; campaignId: string; leads: number; alreadyClaimed: boolean }
  | { ok: false; reason: "not_found" | "taken" | "empty" };

/**
 * Attaches a finished discover run to a signed-in account.
 *
 * Idempotent on purpose — the claim happens right after an OAuth round trip, which is exactly the
 * kind of navigation people repeat by reloading. A second call returns the same campaign instead of
 * doubling every lead.
 */
export async function claimSearch(userId: string, searchId: string, plan?: string | null): Promise<ClaimResult> {
  const searches = await Searches();
  const search = await searches.findOne({ searchId });
  if (!search) return { ok: false, reason: "not_found" };
  // A run already attached to someone else is not ours to hand over, even with the id in hand.
  if (search.userId && search.userId !== userId) return { ok: false, reason: "taken" };

  const campaigns = await Campaigns();
  const leadsCol = await Leads();

  const existing = await campaigns.findOne({ userId });
  if (existing && search.userId === userId) {
    return { ok: true, campaignId: existing._id.toString(), leads: await leadsCol.countDocuments({ userId }), alreadyClaimed: true };
  }
  if (search.leads.length === 0) return { ok: false, reason: "empty" };

  const now = new Date();
  // The fast pass infers a niche, not a persona, so the hypothesis is named after the niche it
  // actually derived — "Freight dock scheduling" — rather than a job title nobody inferred. The
  // deep analysis names real personas; until it has run, claiming one here would be a guess
  // dressed as a finding.
  const buyerName = search.fast?.nicheKey
    ? search.fast.nicheKey.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
    : "Everyone we found";

  const campaignId =
    existing?._id.toString() ??
    (
      await campaigns.insertOne({
        userId,
        productName: productNameFrom(search),
        productUrl: search.productUrl ?? "",
        whatYouSell: search.fast?.whatYouSell ?? search.productSentence ?? "",
        dailyCap: 30,
        paused: false,
        revenueBase: 0,
        channels: DEFAULT_CHANNELS,
        keywords: search.fast?.keywords,
        nicheKey: search.fast?.nicheKey,
        problemPhrases: search.fast?.keywords,
        seekingPhrases: search.fast?.keywords,
        relevanceWindowDays: 365,
        stats: {
          sentToday: 0,
          buyersTotal: search.leads.length,
          contactedTotal: 0,
          repliedTotal: 0,
          callsBooked: 0,
          communitiesTotal: search.communitiesTotal,
          weeksActive: 0,
        },
        trialEndsAt: new Date(now.getTime() + 7 * 86_400_000),
        createdAt: now,
        updatedAt: now,
      } satisfies CampaignDoc)
    ).insertedId.toString();

  // Dedupe against anything the account already has, by person — a founder who ran discover twice
  // should get the union, not the same handle listed twice under two campaigns.
  const already = new Set((await leadsCol.find({ userId }, { projection: { authorHandle: 1 } }).toArray()).map((l) => (l.authorHandle ?? "").toLowerCase()));
  const fresh = search.leads.filter((l) => !already.has(l.author.toLowerCase()));

  if (fresh.length > 0) {
    await leadsCol.insertMany(leadDocs({ userId, campaignId, leads: fresh, buyerName }));
  }

  const communities = await Communities();
  const venues = [...new Set(search.leads.map((l) => l.venueName))];
  const existingVenues = new Set((await communities.find({ userId }, { projection: { name: 1 } }).toArray()).map((c) => c.name));
  const newVenues = venues.filter((v) => !existingVenues.has(v));
  if (newVenues.length > 0) {
    await communities.insertMany(
      newVenues.map((name, i) => {
        const found = search.leads.filter((l) => l.venueName === name).length;
        return {
          userId,
          campaignId,
          key: `${slugify(name)}-${now.getTime()}-${i}`,
          name,
          mapLabel1: name,
          mapLabel2: search.leads.find((l) => l.venueName === name)?.platform ?? "",
          // Member counts are a platform figure this pipeline never fetched, so the label says so
          // rather than showing a number nobody measured.
          members: "size unknown",
          membersNum: 0,
          fit: "Untested" as const,
          reached: "0 reached",
          reachedNum: 0,
          replied: "0 replied",
          repliedNum: 0,
          note: `${found} ${found === 1 ? "person" : "people"} found here`,
          rev: "no pipeline yet",
          updatedAt: now,
        };
      }),
    );
  }

  const hypotheses = await Hypotheses();
  if ((await hypotheses.countDocuments({ userId })) === 0) {
    await hypotheses.insertOne({
      userId,
      campaignId,
      key: slugify(buyerName),
      name: buyerName,
      rate: "—",
      meta: search.fast?.whatYouSell ?? "",
      status: "primary" as const,
      updatedAt: now,
    });
  }

  await searches.updateOne({ searchId }, { $set: { userId } });

  // Bookkeeping, after the inserts and never in front of them: a claim that handed over real people
  // must not fail because metering did.
  if (fresh.length > 0) {
    try {
      await ensureCreditIndexes();
      await meterLeads({
        userId,
        plan,
        leads: fresh.map((l) => ({ email: null, role: null, platform: l.platform, authorHandle: l.author, intentTier: TIER_OF[l.intentType ?? ""] ?? null })),
      });
    } catch (err) {
      console.error("[discover] claim metering failed:", err instanceof Error ? err.message : err);
    }
  }

  return { ok: true, campaignId, leads: fresh.length, alreadyClaimed: false };
}

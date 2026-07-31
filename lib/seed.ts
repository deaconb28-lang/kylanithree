import { Campaigns, Communities, Findings, Hypotheses, Leads, Suppressions, type CampaignDoc } from "./collections";
import { generateCampaignSeed, type GeneratedSeed } from "./generateCampaignSeed";

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
  dedupe?: { leadKeys: Set<string>; communityNames: Set<string> };
}): Promise<{ insertedLeads: number; insertedCommunities: number }> {
  const now = new Date();
  const { userId, campaignId: cid, buyers, generated, dedupe } = params;

  const leadsToInsert = dedupe
    ? generated.leads.filter((l) => !dedupe.leadKeys.has(l.sourceUrl ? `url:${l.sourceUrl}` : `ns:${l.name}|${l.source}`))
    : generated.leads;
  const communitiesToInsert = dedupe ? generated.communities.filter((c) => !dedupe.communityNames.has(c.name)) : generated.communities;

  if (leadsToInsert.length) {
    const leadsCol = await Leads();
    await leadsCol.insertMany(
      leadsToInsert.map((l) => {
        const buyer = buyers[l.buyerIndex] ?? buyers[0];
        return {
          userId,
          campaignId: cid,
          name: l.name,
          role: l.role,
          company: l.company,
          detail: l.detail,
          email: l.email ?? undefined,
          hypothesisKey: slugify(buyer.name),
          source: l.source,
          sourceUrl: l.sourceUrl ?? undefined,
          quote: l.quote ?? undefined,
          quoteMeta: l.quoteMeta ?? undefined,
          subject: l.subject,
          draft: l.draft,
          status: (l.dropped ? "dropped" : "waiting") as "dropped" | "waiting",
          timeSensitive: l.dropped ? false : l.timeSensitive,
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
        members: c.members,
        membersNum: parseMembersNum(c.members),
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

  return { insertedLeads: leadsToInsert.length, insertedCommunities: communitiesToInsert.length };
}

export type OnboardingAnswers = {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category?: string;
  keywords?: string[];
  // Populated when Step5Search already ran the real lead search during onboarding (the normal
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
    // Already seeded (e.g. a duplicate call) — just keep the product info current, don't regenerate leads.
    await campaigns.updateOne(
      { userId },
      { $set: { productUrl: onboarding.url, whatYouSell: onboarding.whatYouSell, channels: onboarding.channels, updatedAt: new Date() } },
    );
    return { campaign: await campaigns.findOne({ userId }), isNew: false };
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
    channels: onboarding.channels,
    keywords: onboarding.keywords,
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

  // generated.leads/communities can legitimately be empty — generateCampaignSeed only returns
  // real, verified search results now rather than a fabricated quota, so a fresh campaign may
  // start with zero of either.
  await persistGeneratedSeed({ userId, campaignId: cid, buyers: onboarding.buyers, generated });

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

export async function ensureSeeded(userId: string) {
  const campaigns = await Campaigns();
  const existing = await campaigns.findOne({ userId });
  if (existing) return existing;

  const now = new Date();

  const campaign: CampaignDoc = {
    userId,
    productName: "Dockside",
    productUrl: "dockside.app",
    whatYouSell: "Dock appointment scheduling that stops trucks stacking up at receiving.",
    dailyCap: 30,
    paused: false,
    revenueBase: 41200,
    channels: { gmail: true, reddit: true, slack: true, discord: true, forums: false, x: false, other: false },
    stats: {
      sentToday: 12,
      buyersTotal: 104,
      contactedTotal: 75,
      repliedTotal: 11,
      callsBooked: 3,
      communitiesTotal: 18,
      weeksActive: 3,
    },
    trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId: campaignId } = await campaigns.insertOne(campaign);
  const cid = campaignId.toString();
  const created = { ...campaign, _id: campaignId };

  const leads = await Leads();
  await leads.insertMany([
    {
      userId,
      campaignId: cid,
      name: "Marisol Reyes",
      role: "Ops manager",
      hypothesisKey: "ops",
      company: "60-person 3PL, Memphis",
      detail: "posted about carriers stacking up in the same 30-minute window",
      source: "r/supplychain",
      quote:
        "We're doing dock appointments in a shared spreadsheet and two carriers showed up in the same 30-minute window twice this week. How is everyone else sequencing inbound without buying a whole WMS?",
      quoteMeta: "34 comments · she replied to four of them",
      subject: "the sequencing question from r/supplychain",
      draft:
        "Two carriers in the same window is usually a sequencing problem rather than a capacity one — we saw the same thing at a 3PL in Reno. What worked was giving carriers a booking link with hard slot limits, so the double-booking becomes impossible instead of visible after the fact. Happy to send the slot template we use, no strings; I build a tool in this space but the spreadsheet version works too.",
      draftMeta: "Comment in the thread, not a DM · question-opener variant",
      postLabel: "Post this reply",
      tag: "Strong intent",
      status: "waiting",
      timeSensitive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Dan Kowalczyk",
      role: "Warehouse lead",
      hypothesisKey: "warehouse",
      company: "140-person distribution centre",
      detail: "our dock is a spreadsheet and it shows",
      source: "X",
      quote: "our dock is a spreadsheet and it shows. four trucks stacked up before 7am today alone.",
      quoteMeta: "6 replies · he's quote-tweeted this twice this month",
      subject: "re: four trucks before 7am",
      draft:
        "Four trucks before 7am is exactly the window Dockside is built for — carriers book a slot instead of just showing up, so the stacking happens on a calendar instead of in your yard. Not a pitch, just: is the spreadsheet actually tracking arrival times, or just who showed up?",
      draftMeta: "Reply to the post, not a DM · curiosity-opener variant",
      postLabel: "Reply to this post",
      tag: "Worth a look",
      status: "waiting",
      timeSensitive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Priya Raman",
      role: "Director of receiving",
      hypothesisKey: "warehouse",
      company: "90-person distribution centre",
      detail: "asked how others handle 6am carrier arrivals",
      source: "Ops Nerds",
      quote: "how is everyone else handling 6am carrier arrivals? we keep getting three trucks at once and nobody has a system for it.",
      quoteMeta: "9 replies in #warehousing",
      subject: "re: 6am carrier arrivals in #warehousing",
      draft:
        "Three at once at 6am is almost always a first-come-first-served gate with no reservation layer underneath. Dockside gives each carrier a booking link with hard slot limits, so 6am becomes three separate ten-minute windows instead of one scramble. Happy to walk you through how a 90-person DC near you set it up, no strings.",
      draftMeta: "Reply in #warehousing, not a DM · direct-answer variant",
      postLabel: "Post this reply",
      tag: "Strong intent",
      status: "waiting",
      timeSensitive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Eli Brandt",
      role: "Ops manager",
      hypothesisKey: "ops",
      company: "Northline Freight, 74 people",
      detail: "hiring a second receiving clerk",
      email: "eli@northlinefreight.com",
      source: "Job ad",
      subject: "the arrival-windows part of that job ad",
      draft:
        "Eli — saw Northline is hiring a receiving clerk and that “managing carrier arrival windows” is the first line of the ad.\n\nThat specific part is what I build. Dockside gives carriers a booking link with hard slot limits, so the arrival sequence is decided before anyone shows up rather than negotiated at the gate. A 60-person 3PL in Memphis went from four double-bookings a week to none.\n\nNot pitching a demo — if it's useful I'll send the slot template as a spreadsheet and you can run it by hand. Want it?\n\n— Maya, Dockside",
      status: "waiting",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Tasha Bell",
      role: "Ops manager",
      hypothesisKey: "ops",
      company: "Crossdock Co, 120 people",
      detail: "wrote about detention fees eating margin",
      source: "LinkedIn",
      subject: "re: detention fees eating margin",
      draft:
        "Tasha — saw the note about detention fees and figured it was worth a direct line rather than a form.\n\nDockside gives carriers a booking link with hard slot limits, so the arrival sequence is decided before anyone shows up rather than negotiated at the gate.\n\nNot pitching a demo — if it's useful I'll send the slot template as a spreadsheet and you can run it by hand. Want it?\n\n— Maya, Dockside",
      status: "waiting",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Ray Oduya",
      role: "Warehouse mgr",
      hypothesisKey: "warehouse",
      company: "Halcyon Fulfilment, 210 people",
      detail: "posted a photo of the yard queue on Monday",
      source: "X",
      subject: "re: the yard queue photo",
      draft:
        "Ray — saw the note about the yard queue and figured it was worth a direct line rather than a form.\n\nDockside gives carriers a booking link with hard slot limits, so the arrival sequence is decided before anyone shows up rather than negotiated at the gate.\n\nNot pitching a demo — if it's useful I'll send the slot template as a spreadsheet and you can run it by hand. Want it?\n\n— Maya, Dockside",
      status: "waiting",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Nina Alvarez",
      role: "Ops manager",
      hypothesisKey: "ops",
      company: "Bayline 3PL, 45 people",
      detail: "asked about carrier no-shows",
      source: "r/supplychain",
      subject: "re: carrier no-shows",
      draft:
        "Nina — saw the note about carrier no-shows and figured it was worth a direct line rather than a form.\n\nDockside gives carriers a booking link with hard slot limits, so the arrival sequence is decided before anyone shows up rather than negotiated at the gate.\n\nNot pitching a demo — if it's useful I'll send the slot template as a spreadsheet and you can run it by hand. Want it?\n\n— Maya, Dockside",
      status: "waiting",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Grant Whitley",
      role: "Ops manager",
      hypothesisKey: "ops",
      company: "Foothill Logistics, 88 people",
      detail: "opened a second dock in June",
      source: "Ops Nerds",
      subject: "re: the second dock",
      draft:
        "Grant — saw the note about the second dock and figured it was worth a direct line rather than a form.\n\nDockside gives carriers a booking link with hard slot limits, so the arrival sequence is decided before anyone shows up rather than negotiated at the gate.\n\nNot pitching a demo — if it's useful I'll send the slot template as a spreadsheet and you can run it by hand. Want it?\n\n— Maya, Dockside",
      status: "waiting",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId,
      campaignId: cid,
      name: "Susan Meier",
      role: "Warehouse mgr",
      hypothesisKey: "warehouse",
      company: "—",
      detail: "nothing specific enough to say to her yet",
      source: "—",
      subject: "",
      draft: "",
      status: "dropped",
      timeSensitive: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const communities = await Communities();
  await communities.insertMany([
    { userId, campaignId: cid, key: "opsnerds", name: "Ops Nerds · Slack", mapLabel1: "Ops Nerds", mapLabel2: "Slack", members: "1.2k members", membersNum: 1200, fit: "Strong fit", reached: "14 reached", reachedNum: 14, replied: "5 replied", repliedNum: 5, note: "Answer questions in #warehousing. Links get ignored; a spreadsheet attachment does not.", rev: "$18,400 pipeline", updatedAt: now },
    { userId, campaignId: cid, key: "supplychain", name: "r/supplychain", mapLabel1: "r/supplychain", mapLabel2: "", members: "41k members", membersNum: 41000, fit: "Strong fit", reached: "9 threads", reachedNum: 9, replied: "4 replied", repliedNum: 4, note: "Participation only, never DMs. Comments on other people’s threads outperform your own posts 3:1.", rev: "$12,900 pipeline", updatedAt: now },
    { userId, campaignId: cid, key: "werc", name: "WERC forums", mapLabel1: "WERC", mapLabel2: "forums", members: "6.8k members", membersNum: 6800, fit: "Strong fit", reached: "11 reached", reachedNum: 11, replied: "2 replied", repliedNum: 2, note: "Slow — two weeks to a reply — but every person here is exactly your buyer.", rev: "$9,900 pipeline", updatedAt: now },
    { userId, campaignId: cid, key: "freightx", name: "Freight ops · X", mapLabel1: "Freight ops", mapLabel2: "X", members: "3.4k members", membersNum: 3400, fit: "Weak", reached: "19 reached", reachedNum: 19, replied: "0 replied", repliedNum: 0, note: "Loud and mostly brokers. I have stopped spending your sends here.", rev: "no pipeline", updatedAt: now },
    { userId, campaignId: cid, key: "logistics", name: "r/logistics", mapLabel1: "r/logistics", mapLabel2: "", members: "188k members", membersNum: 188000, fit: "Weak", reached: "participation", reachedNum: 40, replied: "1 replied", repliedNum: 1, note: "Mostly drivers. Good for reading language, poor for finding buyers.", rev: "no pipeline", updatedAt: now },
    { userId, campaignId: cid, key: "caviar", name: "Freight Caviar · newsletter", mapLabel1: "Freight Caviar", mapLabel2: "untested", members: "22k readers", membersNum: 22000, fit: "Untested", reached: "—", reachedNum: null, replied: "—", repliedNum: null, note: "Sponsorship rather than outreach. $600 a send. Your call, not mine.", rev: "untested", updatedAt: now },
    { userId, campaignId: cid, key: "discord", name: "3PL Builders · Discord", mapLabel1: "3PL Builders", mapLabel2: "Discord", members: "740 members", membersNum: 740, fit: "Strong fit", reached: "6 reached", reachedNum: 6, replied: "2 replied", repliedNum: 2, note: "Small, technical, founder-friendly. Introduce yourself in #intros first.", rev: "$6,000 pipeline", updatedAt: now },
  ]);

  const hypotheses = await Hypotheses();
  await hypotheses.insertMany([
    { userId, campaignId: cid, key: "ops", name: "Operations manager", rate: "18%", meta: "Best in 20–100 person 3PLs · 41 contacted, 3 calls booked", status: "primary", updatedAt: now },
    { userId, campaignId: cid, key: "warehouse", name: "Warehouse manager", rate: "9%", meta: "Replies warmly, can't buy · 22 contacted, 0 calls", status: "learning", updatedAt: now },
    { userId, campaignId: cid, key: "logistics", name: "Logistics director", rate: "3%", meta: "Stopped after 34 contacted", status: "paused", updatedAt: now },
  ]);

  const findings = await Findings();
  await findings.insertMany([
    { userId, campaignId: cid, tag: "Opening", headline: "Naming their post beats naming their company.", body: "Messages that quote something the person wrote reply at 21%. Messages that only reference the company reply at 6%. Same product, same length.", createdAt: now },
    { userId, campaignId: cid, tag: "Language", headline: "They say “detention fees”, you say “dock congestion”.", body: "Nine of eleven repliers described the problem as money lost to waiting trucks, not as a scheduling problem. Worth changing on your homepage.", createdAt: now },
    { userId, campaignId: cid, tag: "Where", headline: "One Slack channel is worth more than all of X.", body: "Ops Nerds #warehousing: 14 reached, 5 replied. Freight ops on X: 19 reached, none. I've stopped spending sends there.", createdAt: now },
    { userId, campaignId: cid, tag: "Coming back", headline: "Four people said “not right now”. Two have a reason to hear from you in September.", body: "Peak season starts for both. I've set return timers and drafted the openers already.", createdAt: now },
  ]);

  const suppressions = await Suppressions();
  await suppressions.insertMany([
    { userId, campaignId: cid, name: "Lena Ford", role: "ops manager, Chicago", reason: "unsubscribed", where: "Was matched via r/supplychain", createdAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000) },
    { userId, campaignId: cid, name: "Marcus Diehl", role: "warehouse director", reason: "existing_customer", where: "Signed up on the waitlist last year", createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
    { userId, campaignId: cid, name: "Priya Anand", role: "fleet coordinator", email: "priya@example.com", reason: "bounced", where: "maya@dockside.app · Gmail", createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000) },
    { userId, campaignId: cid, name: "Owen Kessler", role: "ops manager", reason: "unsubscribed", where: "Replied \"stop\" on Slack", createdAt: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000) },
  ]);

  return created;
}

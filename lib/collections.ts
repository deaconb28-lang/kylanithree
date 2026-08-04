import { getDb } from "./mongodb";

// The lead's own state. `converted` is the terminal one and is FOUNDER-ENTERED, never inferred:
// nothing this product can observe proves a sale, so the only honest source is the person who was
// paid. See lib/campaign/types.ts for how these map onto the four dashboard stages.
export type LeadStatus = "waiting" | "approved" | "dropped" | "sent" | "replied" | "converted";

// How strongly this person is expressing the problem right now. Assigned by the scoring stage
// from the real post text, not guessed — see lib/search/score.ts.
export type IntentTier = "seeking" | "complaining" | "adjacent";

export interface LeadDoc {
  userId: string;
  campaignId: string;
  name: string;
  role: string;
  company: string;
  detail: string;
  email?: string;
  hypothesisKey?: string;
  source: string;
  sourceUrl?: string;
  quote?: string;
  quoteMeta?: string;
  // subject/draft are written on demand (/api/leads/[id]/draft), not during search — composing
  // outreach used to sit on the critical path of every search and dominated its latency.
  subject: string;
  draft: string;
  draftMeta?: string;
  postLabel?: string;
  tag?: string;
  status: LeadStatus;
  timeSensitive: boolean;
  feedback?: "landed" | "missed";
  /** When the founder marked this person converted. The only date the cohort table can trust. */
  convertedAt?: Date;
  // --- evidence: every field below comes from the platform itself, never from a model, which is
  // what makes a lead checkable rather than merely asserted.
  authorHandle?: string;
  permalink?: string;
  postedAt?: Date;
  excerpt?: string; // verified to be a literal span of the real post body
  intentTier?: IntentTier;
  venueId?: string;
  signalScore?: number;
  // The user-facing quality score (see lib/search/leadScore.ts). Stored rather than recomputed so
  // the dashboard ranks consistently and the breakdown shown on a lead never drifts from the one
  // it was ranked by.
  stars?: number;
  scoreTotal?: number;
  scoreLabel?: string;
  scoreBreakdown?: { intent: number; confidence: number; recency: number; engagement: number };
  createdAt: Date;
  updatedAt: Date;
}

// One row per search run, so a thin result set can be diagnosed after the fact instead of
// reproduced by guesswork: which stage lost the candidates, and why.
export interface SearchRunDoc {
  userId?: string;
  campaignId?: string;
  runId: string;
  nicheKey?: string;
  stages: {
    stage: string;
    candidatesIn: number;
    candidatesOut: number;
    ms: number;
    drops: Record<string, number>;
    note?: string;
  }[];
  totalMs: number;
  leadsShipped: number;
  createdAt: Date;
}

export interface CommunityDoc {
  userId: string;
  campaignId: string;
  key: string;
  name: string;
  mapLabel1: string;
  mapLabel2: string;
  members: string;
  membersNum: number;
  fit: "Strong fit" | "Weak" | "Untested";
  reached: string;
  reachedNum: number | null;
  replied: string;
  repliedNum: number | null;
  note: string;
  rev: string;
  updatedAt: Date;
}

export type HypothesisStatus = "primary" | "learning" | "paused";

export interface HypothesisDoc {
  userId: string;
  campaignId: string;
  key: string;
  name: string;
  rate: string;
  meta: string;
  status: HypothesisStatus;
  updatedAt: Date;
}

export interface FindingDoc {
  userId: string;
  campaignId: string;
  tag: string;
  headline: string;
  body: string;
  createdAt: Date;
}

export interface CampaignStats {
  sentToday: number;
  buyersTotal: number;
  contactedTotal: number;
  repliedTotal: number;
  callsBooked: number;
  communitiesTotal: number;
  weeksActive: number;
}

export interface StripeConnection {
  connected: boolean;
  accountId?: string;
  accessToken?: string;
  connectedAt?: Date;
}

// This is Kylani's OWN subscription billing (one plan, via the platform's Stripe account and real
// Checkout Sessions — see lib/billing.ts and app/api/stripe/checkout) — a completely separate concept from
// StripeConnection above, which is a founder connecting THEIR OWN Stripe account so Map can show
// their real product revenue. Never conflate the two.
export interface SubscriptionInfo {
  /** "kylani" is the only plan sold. "pro"/"founder" are legacy rows still honoured — see lib/billing.ts. */
  plan: "kylani" | "pro" | "founder";
  interval: "monthly" | "annual";
  status: "active" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd?: Date;
  updatedAt: Date;
}

export interface CampaignDoc {
  userId: string;
  productName: string;
  productUrl: string;
  whatYouSell: string;
  dailyCap: number;
  paused: boolean;
  revenueBase: number;
  channels: Record<string, boolean>;
  // Real phrases people actually use for this problem, found during onboarding's site analysis —
  // kept so a later re-search (see /api/campaign/search) can reuse them instead of falling back
  // to a generic placeholder.
  keywords?: string[];
  // The full search lexicon from onboarding. Stored so a re-search reuses the same vocabulary,
  // niche cache entry, and relevance window rather than re-deriving a coarser one from `keywords`.
  problem?: string;
  nicheKey?: string;
  problemPhrases?: string[];
  seekingPhrases?: string[];
  negativeTerms?: string[];
  relevanceWindowDays?: number;
  stats: CampaignStats;
  stripe?: StripeConnection;
  subscription?: SubscriptionInfo;
  // 7 days from campaign creation. Real, not decorative — used to drive the sidebar's trial pill
  // and the Trial page. Doesn't gate access on its own (see lib/billing.ts / the Trial page for
  // the real subscription state that now exists alongside it).
  trialEndsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// A real suppression record — never fabricated. Created only two ways: automatically when a
// recipient clicks the unsubscribe link in a sent email (reason "unsubscribed"), or when the
// founder manually flags a contact via the Suppress action on a lead (any of the three reasons).
// There's no bounce-webhook integration, so "bounced" only appears when a founder reports it
// themselves after seeing a bounce in their own inbox.
export type SuppressionReason = "unsubscribed" | "bounced" | "existing_customer";

export interface SuppressionDoc {
  userId: string;
  campaignId: string;
  name: string;
  role: string;
  email?: string | null;
  reason: SuppressionReason;
  where: string;
  leadId?: string;
  createdAt: Date;
}

// --- credits -------------------------------------------------------------------------------
// See docs/credits.md. The rule that shapes these: meter every plan, bill only some. A usage event
// is written on Free, Pro and Founder alike; only Free debits a wallet. That gives per-account COGS
// and abuse detection now, and lets plan rules change later without re-plumbing anything.

export interface UsageEventDoc {
  userId: string;
  planAtTime: string;
  action: string;
  resourceId?: string;
  credits: number;
  /** False on unlimited plans — the event is still recorded, it just doesn't move a balance. */
  billed: boolean;
  /** What this actually cost US. Why metering unlimited plans pays for itself. */
  vendorCostCents?: number;
  rateCardVersion: number;
  /** Workers retry. A retry that double-debits ends in a chargeback, so this is not optional. */
  idempotencyKey: string;
  createdAt: Date;
}

/** One row per person per account, ever. Enforces "charged once for a person, lifetime". */
export interface LeadChargeDoc {
  userId: string;
  personFingerprint: string;
  tier: string;
  credits: number;
  createdAt: Date;
}

export async function UsageEvents() {
  return (await getDb()).collection<UsageEventDoc>("usageEvents");
}

export async function LeadCharges() {
  return (await getDb()).collection<LeadChargeDoc>("leadCharges");
}

export async function Campaigns() {
  return (await getDb()).collection<CampaignDoc>("campaigns");
}
export async function Leads() {
  return (await getDb()).collection<LeadDoc>("leads");
}
export async function Communities() {
  return (await getDb()).collection<CommunityDoc>("communities");
}
export async function Hypotheses() {
  return (await getDb()).collection<HypothesisDoc>("hypotheses");
}
export async function Findings() {
  return (await getDb()).collection<FindingDoc>("findings");
}
export async function Suppressions() {
  return (await getDb()).collection<SuppressionDoc>("suppressions");
}
export async function SearchRuns() {
  return (await getDb()).collection<SearchRunDoc>("searchRuns");
}

/**
 * Billing that outlives a campaign.
 *
 * The subscription and the connected Stripe account live on `CampaignDoc` because that is where
 * they were first needed, but neither actually belongs to a campaign — they belong to the account.
 * Deleting a campaign therefore has to lift them somewhere, or a paying customer would be stranded:
 * Stripe keeps charging the card and nothing in our database says they are subscribed. See
 * `lib/account/reset.ts`, which writes here on delete and reads it back when the next campaign is
 * created.
 *
 * Most accounts have no row here at all. Its presence means "this account has had billing that
 * currently has no campaign to sit on".
 */
export interface AccountBillingDoc {
  userId: string;
  subscription?: SubscriptionInfo;
  stripe?: StripeConnection;
  updatedAt: Date;
}

export async function AccountBilling() {
  return (await getDb()).collection<AccountBillingDoc>("accountBilling");
}

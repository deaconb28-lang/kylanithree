import { getDb } from "./mongodb";

export type LeadStatus = "waiting" | "approved" | "dropped" | "sent" | "replied";

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
  subject: string;
  draft: string;
  draftMeta?: string;
  postLabel?: string;
  tag?: string;
  status: LeadStatus;
  timeSensitive: boolean;
  feedback?: "landed" | "missed";
  createdAt: Date;
  updatedAt: Date;
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

// This is Kylani's OWN subscription billing (Pro/Founder, via the platform's Stripe account and
// its real Payment Links — see lib/billing.ts) — a completely separate concept from
// StripeConnection above, which is a founder connecting THEIR OWN Stripe account so Map can show
// their real product revenue. Never conflate the two.
export interface SubscriptionInfo {
  plan: "pro" | "founder";
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

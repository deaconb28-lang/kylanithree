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

export interface CampaignDoc {
  userId: string;
  productName: string;
  productUrl: string;
  whatYouSell: string;
  dailyCap: number;
  paused: boolean;
  revenueBase: number;
  channels: Record<string, boolean>;
  stats: CampaignStats;
  stripe?: StripeConnection;
  createdAt: Date;
  updatedAt: Date;
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

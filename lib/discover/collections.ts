import { getDb } from "../mongodb";
import type { IntentType } from "../search/intent";

// State for one discover run, plus the analytics events that let us verify the flow is actually
// faster rather than assume it.
//
// A discover run is anonymous by design — no userId. The whole point of the new flow is that value
// arrives before an account exists, so `searches` is keyed on a random id the browser holds and
// only gets a userId later, if the person signs up to save it.

export type SearchStatus = "queued" | "running" | "partial" | "complete" | "failed";
export type Pass = 1 | 2;

/** A person, as shown on screen. Deduped on `personFingerprint`, never on post URL. */
export interface DiscoverLead {
  personFingerprint: string;
  author: string;
  platform: string;
  venueName: string;
  /** The evidence post. */
  permalink: string;
  excerpt: string;
  postedAt: Date;
  intentType?: IntentType;
  /** Why this person matched, in plain terms, for the card. */
  matchedFor: string[];
  score: number;
  /** Which pass first surfaced them. Never shown to the user; used for shallow-survival only. */
  foundInPass: Pass;
  /** Filled by pass 2 enrichment; absent on a pass-1 lead and that is fine. */
  contact?: { channel: string; value: string; status: string };
}

export interface SearchDoc {
  searchId: string;
  /** Set only if the person later signs up and saves this run. */
  userId?: string;
  productUrl?: string;
  /** The "no site yet" path: one sentence instead of a URL. */
  productSentence?: string;
  status: SearchStatus;

  // --- inference, in two tiers like the search itself ---
  fast?: { whatYouSell: string; keywords: string[]; nicheKey: string; ms: number };
  deep?: {
    whatYouSell: string;
    problem: string;
    buyers: { name: string; desc: string }[];
    nicheKey: string;
    problemPhrases: string[];
    seekingPhrases: string[];
    negativeTerms: string[];
    relevanceWindowDays: number;
    ms: number;
  };
  /** Fields the user corrected in place. Drives the correction-rate metric. */
  corrections?: { field: string; from: string; to: string; at: Date }[];

  leads: DiscoverLead[];
  /** Person fingerprints surfaced by pass 1, kept so shallow survival is computable at the end. */
  passOneFingerprints?: string[];
  narration: { at: Date; text: string }[];
  communitiesScanned: number;
  communitiesTotal: number;

  // --- the numbers that verify the 2-3x claim ---
  startedAt: Date;
  firstLeadAt?: Date;
  passOneDoneAt?: Date;
  completedAt?: Date;
  /** Share of pass-1 leads still in the top 20 once pass 2 finishes. Low means pass 1 is padding. */
  shallowSurvival?: number;
  error?: string;
}

/**
 * One row per funnel event. Deliberately in Mongo rather than a new analytics vendor: the questions
 * we need answered (time-to-first-lead, per-step drop-off, correction rate) are all aggregations
 * over a handful of typed events, and /diagnostics can already read Mongo.
 */
export interface AnalyticsEventDoc {
  /** Random per-browser id, so a funnel can be followed without an account. */
  anonId: string;
  searchId?: string;
  name: string;
  /** Which onboarding implementation produced this, so the two are comparable. */
  flow: "legacy" | "discover";
  /** Milliseconds since the run started, when the event is a timing. */
  ms?: number;
  props?: Record<string, string | number | boolean>;
  at: Date;
}

export async function Searches() {
  return (await getDb()).collection<SearchDoc>("searches");
}

export async function AnalyticsEvents() {
  return (await getDb()).collection<AnalyticsEventDoc>("analyticsEvents");
}

export async function ensureDiscoverIndexes(): Promise<void> {
  const [searches, events] = await Promise.all([Searches(), AnalyticsEvents()]);
  await Promise.all([
    searches.createIndex({ searchId: 1 }, { unique: true, name: "search_id" }),
    searches.createIndex({ userId: 1, startedAt: -1 }, { name: "search_by_user" }),
    // Anonymous runs are disposable. A TTL keeps the collection from growing without bound, and
    // 30 days is long enough that a saved run is claimed well before it expires.
    searches.createIndex({ startedAt: 1 }, { name: "search_ttl", expireAfterSeconds: 30 * 86_400 }),
    events.createIndex({ name: 1, flow: 1, at: -1 }, { name: "event_funnel" }),
    events.createIndex({ anonId: 1, at: 1 }, { name: "event_by_visitor" }),
    events.createIndex({ at: 1 }, { name: "event_ttl", expireAfterSeconds: 180 * 86_400 }),
  ]);
}

import type { IntentTier, LeadStatus } from "../collections";

// The campaign dashboard's contracts.
//
// NOTHING HERE IS BACKED BY A FIXTURE. There is no `lib/mock/`, deliberately and by instruction:
// every number, name and quote the dashboard renders is derived from the `leads`, `communities`,
// `hypotheses` and `worklog` collections, or it is absent. That is the same rule the rest of this
// product is held to — a fabricated Dockside scenario is exactly the fabricated Dockside campaign
// that had to be torn out of `lib/seed.ts` once already.
//
// The practical consequence is that EMPTY IS THE COMMON CASE, not an edge case. A brand-new account
// has zero of everything, and the dashboard's empty states are therefore load-bearing UI rather
// than a defensive afterthought. Every type below models absence explicitly rather than defaulting
// to zero, because "we have not looked yet" and "we looked and found none" are different answers.

/**
 * The four stages, in order.
 *
 * The funnel is CUMULATIVE: a person in conversation has also been found and engaged, so they are
 * counted in all three. That is what makes the connector rates meaningful — 54/128 is "of the people
 * found, this many were engaged" — and it is what keeps the spine agreeing with the cohort table.
 */
export const STAGES = ["found", "engaged", "in_conversation", "converted"] as const;
export type StageKey = (typeof STAGES)[number];

export const STAGE_LABEL: Record<StageKey, string> = {
  found: "Found",
  engaged: "Engaged",
  in_conversation: "In conversation",
  converted: "Converted",
};

/**
 * The exact status vocabulary, and nothing else may be rendered.
 *
 * Kept as one map so a status string can never be shown raw. `dropped` is deliberately absent — a
 * dropped person has left the funnel and has no status to display.
 */
export const STATUS_LABEL = {
  draft: "Draft by Kylani",
  awaiting: "Awaiting your approval",
  scheduled: "Scheduled",
  sent: "Sent",
  posted: "Posted",
  replied: "Replied",
  converted: "Converted",
} as const;
export type StatusKey = keyof typeof STATUS_LABEL;

/**
 * How far a person has actually got.
 *
 * `dropped` returns null rather than a stage: the founder said "not a fit", and counting them under
 * Found would inflate the top of the funnel with people who have been explicitly removed from it.
 * A funnel that only grows is a vanity metric.
 *
 * `approved` stays at Found on purpose. It means a draft was approved, not that anything reached the
 * person — treating an approved draft as an engagement would claim a touch that never happened.
 */
export function stageOf(status: LeadStatus): StageKey | null {
  switch (status) {
    case "dropped":
      return null;
    case "waiting":
    case "approved":
      return "found";
    case "sent":
      return "engaged";
    case "replied":
      return "in_conversation";
    case "converted":
      return "converted";
  }
}

/** A person on the board, flattened from `LeadDoc` for the client. */
export interface CampaignPerson {
  id: string;
  name: string;
  handle?: string;
  /** Where they were found. Always a real venue name, never "Unknown". */
  source: string;
  permalink?: string;
  profileUrl?: string;
  /** Their own words. The hero of a Found card and the receipt on a Converted row. */
  quote?: string;
  /** Kylani's restatement. Absent when the classifier has not run — never substituted with the quote. */
  summary?: string;
  bio?: string;
  hypothesisKey?: string;
  intentTier?: IntentTier;
  stars?: number;
  scoreTotal?: number;
  status: LeadStatus;
  stage: StageKey;
  /** When the signal was posted, not when we found it. */
  postedAt?: string;
  firstSeenAt: string;
  updatedAt: string;
  /** Set only once someone converts. Days from first signal to conversion. */
  daysToConvert?: number;
}

/** One node of the spine. */
export interface StageNode {
  key: StageKey;
  label: string;
  /** People who have reached AT LEAST this stage. */
  count: number;
  /**
   * Change over the trailing seven days, or null when the account is too young to have a
   * comparison. Null renders as nothing; zero renders as "+0", which is a real measurement.
   */
  delta: number | null;
  /**
   * Share of the previous stage that reached this one, 0–1. Null on the first node (nothing precedes
   * it) and whenever the previous stage is empty, because x/0 is not 0%, it is unanswerable.
   */
  rateFromPrevious: number | null;
}

export interface FunnelSummary {
  stages: StageNode[];
  /** Everyone still in the funnel — excludes dropped. Equals the Found count. */
  total: number;
  /** True when nothing has ever been found. Distinct from every stage reading zero after a purge. */
  neverRun: boolean;
}

/** A single agent action, for the worklog drawer. */
export interface WorklogItem {
  id: string;
  at: string;
  /** Mono line: "drafted reply to @harborhand". Written in past tense, always naming the object. */
  summary: string;
  /** One line of why, revealed on expand. Absent when the action carries no decision. */
  rationale?: string;
  /** Where the action landed, so the log is navigable rather than a list of claims. */
  href?: string;
  kind: WorklogKind;
}

export type WorklogKind =
  | "found"
  | "drafted"
  | "sent"
  | "posted"
  | "replied"
  | "scheduled"
  | "searched"
  | "enriched"
  | "converted";

/** A planned unit of work on the calendar board. */
export interface PlanCard {
  id: string;
  kind: PlanKind;
  /** ISO instant. The board groups by local day, so this must survive a timezone. */
  at: string;
  status: StatusKey;
  title: string;
  /** The mono purpose line every card carries: "serves: no-show-fee hypothesis". */
  purpose?: string;
  platform?: string;
  /** Present on outreach and follow-ups: who this is aimed at. */
  personId?: string;
  personName?: string;
  hypothesisKey?: string;
  /** True for a slot Kylani is proposing rather than one already on the plan. */
  suggestion?: boolean;
}

export type PlanKind = "post" | "outreach" | "follow_up";

/** How much Kylani may do without asking. */
export const AUTONOMY = ["suggest", "approve", "run"] as const;
export type Autonomy = (typeof AUTONOMY)[number];

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  suggest: "Suggest",
  approve: "Approve",
  run: "Run",
};

/** What each mode actually changes, shown in the UI so the control is not a mystery. */
export const AUTONOMY_EFFECT: Record<Autonomy, string> = {
  suggest: "Kylani proposes work. Nothing is drafted until you ask.",
  approve: "Kylani drafts everything and waits for you. Nothing leaves without approval.",
  run: "Kylani sends routine replies itself. Each one can be undone for 5 minutes.",
};

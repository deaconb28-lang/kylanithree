import { STAGES, STAGE_LABEL, stageOf, type FunnelSummary, type StageKey, type StageNode } from "./types";
import type { LeadStatus } from "../collections";

// The funnel arithmetic, kept pure so one implementation feeds the spine, the stage workspaces and
// the cohort table.
//
// "Spine counts, deltas and conversion rates agree with the cohort table" is an acceptance criterion,
// and the only way to hold it is to have ONE derivation. The failure this prevents is the ordinary
// one: a header that counts `status === "sent"` beside a table that counts everyone who was ever
// sent to, disagreeing by exactly the people who have since replied, with no test able to catch it
// because both queries are individually correct.
//
// Cumulative is the whole trick. A person who replied has also been found and engaged, so they are
// counted at all three stages. That is what makes a connector rate answerable — 54 of 128 found were
// engaged — and it is why the numbers only ever descend.

/** What the derivation needs from a lead. Deliberately minimal so tests need no database. */
export interface FunnelInput {
  status: LeadStatus;
  /** When this person entered the funnel. Used for the trailing-week delta. */
  firstSeenAt: Date | string;
  /** When they last moved. A person who reached a stage before the window is not new to it. */
  updatedAt: Date | string;
}

const RANK: Record<StageKey, number> = { found: 0, engaged: 1, in_conversation: 2, converted: 3 };

const WEEK_MS = 7 * 86_400_000;

function ms(v: Date | string): number {
  return v instanceof Date ? v.getTime() : Date.parse(v);
}

/**
 * The spine, from the account's real leads.
 *
 * `now` is injected rather than read from the clock so the delta window is testable and so a server
 * render and a client render of the same data cannot disagree by a few milliseconds of boundary.
 */
export function buildFunnel(leads: FunnelInput[], now: number = Date.now()): FunnelSummary {
  const since = now - WEEK_MS;

  const counts: Record<StageKey, number> = { found: 0, engaged: 0, in_conversation: 0, converted: 0 };
  const recent: Record<StageKey, number> = { found: 0, engaged: 0, in_conversation: 0, converted: 0 };
  let inFunnel = 0;
  // Whether the account has any history at all — including people it has since dropped. A funnel of
  // all zeroes because every lead was rejected is a different state from one that has never run, and
  // the empty copy for each says something different.
  let everSeen = 0;

  for (const lead of leads) {
    everSeen += 1;
    const reached = stageOf(lead.status);
    if (!reached) continue; // dropped: explicitly removed from the funnel, not counted anywhere
    inFunnel += 1;

    const rank = RANK[reached];
    for (const stage of STAGES) {
      if (RANK[stage] > rank) break;
      counts[stage] += 1;
    }

    // The delta is credited to the stage the person is AT, dated by their last movement — that is
    // the only date we hold for a transition. Found is dated by first sighting instead, because
    // `updatedAt` moves for reasons that have nothing to do with entering the funnel (an enrichment
    // pass, a re-score), and crediting those as new arrivals would inflate the top of the funnel
    // every time the worker touched a row.
    const movedAt = reached === "found" ? ms(lead.firstSeenAt) : ms(lead.updatedAt);
    if (Number.isFinite(movedAt) && movedAt >= since) recent[reached] += 1;
  }

  const hasHistory = everSeen > 0;

  const stages: StageNode[] = STAGES.map((key, i) => {
    const previous = i === 0 ? null : counts[STAGES[i - 1]];
    return {
      key,
      label: STAGE_LABEL[key],
      count: counts[key],
      // Null, not zero, before there is any history: "+0 this week" on a brand-new account is a
      // measurement nobody took.
      delta: hasHistory ? recent[key] : null,
      // x/0 is unanswerable, not 0%. A rate is omitted rather than invented.
      rateFromPrevious: previous === null || previous === 0 ? null : counts[key] / previous,
    };
  });

  return { stages, total: inFunnel, neverRun: !hasHistory };
}

/** "42%" — or nothing at all, because a missing rate must never render as 0%. */
export function formatRate(rate: number | null): string | null {
  if (rate === null) return null;
  return `${Math.round(rate * 100)}%`;
}

/** "+12 this wk". Zero is shown, because zero is a real week. Null renders nothing. */
export function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  return `+${delta} this wk`;
}

/**
 * Whole days from first signal to conversion.
 *
 * Rounded DOWN and floored at zero: someone found and converted inside the same day converted in
 * zero days, and rounding that up to one would put a day into the record that did not happen.
 */
export function daysToConvert(firstSeenAt: Date | string, convertedAt: Date | string): number | null {
  const a = ms(firstSeenAt);
  const b = ms(convertedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

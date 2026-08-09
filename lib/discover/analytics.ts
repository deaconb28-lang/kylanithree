import { AnalyticsEvents, type AnalyticsEventDoc } from "./collections";

// Funnel instrumentation. Required, not optional — without it the "2-3x faster" claim is an
// assertion rather than a measurement, and the old flow has no baseline at all.
//
// Events go to Mongo rather than a new analytics vendor. Everything we need to answer is an
// aggregation over a handful of typed events, /diagnostics already reads Mongo, and adding a
// vendor would mean another key, another egress dependency and another thing to be down.

export type EventName =
  // --- funnel: every step boundary, so drop-off is computable ---
  | "landing_view"
  | "url_submitted"
  | "discover_view"
  // --- the timings that verify the claim ---
  | "first_lead_shown" // time-to-first-lead
  | "first_interaction" // time-to-first-meaningful-interaction
  | "pass_one_complete"
  | "search_complete"
  // --- correction rate on inferred fields ---
  | "inference_corrected"
  // --- the gate, now at the end rather than the middle ---
  | "save_clicked"
  | "signed_in"
  // --- failure, tracked because degraded results are supposed to beat errors ---
  | "search_degraded"
  | "search_failed";

export type Flow = "legacy" | "discover";

/**
 * Records one event. Never throws and never blocks the caller — analytics failing must not take a
 * search with it, and a lost event is worth far less than a lost lead.
 */
export async function track(event: {
  anonId: string;
  name: EventName;
  flow: Flow;
  searchId?: string;
  ms?: number;
  props?: AnalyticsEventDoc["props"];
}): Promise<void> {
  try {
    const events = await AnalyticsEvents();
    await events.insertOne({
      anonId: event.anonId,
      searchId: event.searchId,
      name: event.name,
      flow: event.flow,
      ms: event.ms,
      props: event.props,
      at: new Date(),
    });
  } catch (err) {
    console.error("[analytics] dropped event:", event.name, err instanceof Error ? err.message : err);
  }
}

export type FunnelStep = { name: string; visitors: number; dropOffPct: number | null };

export type FlowReport = {
  flow: Flow;
  runs: number;
  /** Median rather than mean throughout: one 90s outlier should not move the headline number. */
  medianTimeToFirstLeadMs: number | null;
  medianTimeToInteractionMs: number | null;
  medianTimeToCompleteMs: number | null;
  funnel: FunnelStep[];
  correctionRate: number | null;
  degradedRate: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// The order a visitor passes through. Drop-off is measured between adjacent steps, so this list
// IS the funnel definition — adding a step here is how a new one starts being measured.
const FUNNEL: EventName[] = ["landing_view", "url_submitted", "discover_view", "first_lead_shown", "first_interaction", "save_clicked"];

/**
 * Builds the comparison report for one flow. Both flows emit the same event names, which is the
 * whole reason the old one stays behind a feature flag rather than being deleted — otherwise there
 * is nothing to compare against.
 */
export async function flowReport(opts: { flow: Flow; sinceDays?: number }): Promise<FlowReport> {
  const { flow, sinceDays = 30 } = opts;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const events = await AnalyticsEvents();
  const rows = await events.find({ flow, at: { $gte: since } }).toArray();

  const byName = new Map<string, AnalyticsEventDoc[]>();
  for (const r of rows) {
    const bucket = byName.get(r.name);
    if (bucket) bucket.push(r);
    else byName.set(r.name, [r]);
  }

  // Distinct visitors per step, not raw event count — one person reloading twice is not two
  // visitors, and counting it as such would understate drop-off.
  const visitorsAt = (name: string) => new Set((byName.get(name) ?? []).map((r) => r.anonId)).size;

  const funnel: FunnelStep[] = FUNNEL.map((name, i) => {
    const visitors = visitorsAt(name);
    const prev = i === 0 ? null : visitorsAt(FUNNEL[i - 1]);
    return {
      name,
      visitors,
      dropOffPct: prev && prev > 0 ? Math.round(((prev - visitors) / prev) * 100) : null,
    };
  });

  const msOf = (name: string) => (byName.get(name) ?? []).map((r) => r.ms).filter((m): m is number => typeof m === "number");

  const runs = visitorsAt("url_submitted");
  const corrections = new Set((byName.get("inference_corrected") ?? []).map((r) => r.searchId ?? r.anonId)).size;
  const degraded = new Set((byName.get("search_degraded") ?? []).map((r) => r.searchId ?? r.anonId)).size;

  return {
    flow,
    runs,
    medianTimeToFirstLeadMs: median(msOf("first_lead_shown")),
    medianTimeToInteractionMs: median(msOf("first_interaction")),
    medianTimeToCompleteMs: median(msOf("search_complete")),
    funnel,
    correctionRate: runs > 0 ? Math.round((corrections / runs) * 100) : null,
    degradedRate: runs > 0 ? Math.round((degraded / runs) * 100) : null,
  };
}

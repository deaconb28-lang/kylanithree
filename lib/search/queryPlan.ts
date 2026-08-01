import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import { INTENT_TYPES, type IntentType } from "./intent";

// The fan-out. See docs/search-architecture.md §5.2.
//
// One user brief becomes 16-19 machine queries. This is where lead volume actually comes from —
// the count at the end is arithmetic on the fan-out, not cleverness in any single retrieval. It
// replaces the old approach of slicing 3-4 phrases off the lexicon, which searched a fraction of
// the ground and then reported the result as though the niche were quiet.
//
// The load-bearing instruction in the prompt: the people we are looking for DO NOT KNOW this
// product exists and would never use its marketing vocabulary. They describe symptoms, not
// categories. A planner that emits the founder's own words finds the founder's own competitors.

export type QueryKind = "problem" | "symptom" | "incumbent" | "adjacent" | "workaround" | "role";

export type PlannedQuery = {
  text: string;
  kind: QueryKind;
  /** Restrict to these intent types, or empty for all. */
  intentFilter: IntentType[];
  recencyDays: number;
  /** How central this query is to the brief, 0-1. Feeds the RRF weighting. */
  weight: number;
};

export type Brief = {
  product: string;
  problemSolved: string;
  buyerRoles: string[];
  companyShapes: string[];
  incumbents: string[];
  adjacentCategories: string[];
  exclusions: string[];
  /** Written in the same neutral register as a normalised problem statement — this is what the
   *  reranker scores every candidate against, so it is the single most important string here. */
  icpSummary: string;
};

const PlanSchema = z.object({
  queries: z
    .array(
      z.object({
        text: z.string().describe("The search query, in the words a sufferer would actually use. Never marketing vocabulary."),
        kind: z.enum(["problem", "symptom", "incumbent", "adjacent", "workaround", "role"]),
        intentFilter: z
          .array(z.enum(["switching_away", "seeking_tool", "evaluating_alternatives", "building_workaround", "hiring_for_problem", "describing_pain"]))
          .describe("Intent types to restrict to. Empty means all."),
        recencyDays: z.number().int().describe("90, 365 or 1825. Evergreen pain ages well; incumbent dissatisfaction does not."),
        weight: z.number().describe("0.0-1.0 — how central this query is to the brief."),
      }),
    )
    .min(8)
    .max(24),
});

const SYSTEM = [
  "You are a retrieval query planner for a lead-generation search engine. The index contains forum",
  "and social posts where people describe problems, ask for tools, and complain about products they",
  "use.",
  "",
  "Given a product brief, produce a diverse set of search queries designed to find people who HAVE",
  "that problem — NOT people who would describe the product.",
  "",
  "Critical: the people you are trying to find do not know this product exists and would never use",
  "its marketing vocabulary. They describe symptoms, not categories. Write queries in THEIR language.",
  "",
  "Produce:",
  "  3 queries   restating the core problem in different neutral phrasings",
  "  4 queries   describing the SYMPTOM or failure mode the user experiences — what goes wrong in",
  "              their day, not what feature is missing",
  "  up to 5     naming specific incumbent products, one query each, phrased as dissatisfaction or",
  "              comparison",
  "  3 queries   covering adjacent categories and near-miss tools",
  "  2 queries   describing the manual workaround someone would build instead",
  "  2 queries   role-and-context framed (e.g. 'solo founder', 'small agency owner')",
  "",
  "intentFilter guidance:",
  "  incumbent queries  -> ['switching_away','evaluating_alternatives']",
  "  workaround queries -> ['building_workaround']",
  "  problem / symptom  -> [] (all)",
  "",
  "recencyDays guidance:",
  "  incumbent and symptom queries -> 365",
  "  problem and role queries      -> 1825 (evergreen pain ages well)",
  "  workaround queries            -> 1825",
  "",
  "Keep each query short — two to six words is what a keyword engine can actually match. A full",
  "sentence matches nothing.",
].join("\n");

const DEFAULT_RECENCY: Record<QueryKind, number> = {
  problem: 1825,
  symptom: 365,
  incumbent: 365,
  adjacent: 365,
  workaround: 1825,
  role: 1825,
};

const KIND_DEFAULT_FILTER: Record<QueryKind, IntentType[]> = {
  problem: [],
  symptom: [],
  incumbent: ["switching_away", "evaluating_alternatives"],
  adjacent: [],
  workaround: ["building_workaround"],
  role: [],
};

/** Clamps whatever the model returned into something the retriever can actually execute. */
export function sanitizePlan(raw: PlannedQuery[]): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];
  for (const q of raw) {
    const text = (q.text ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const kind: QueryKind = (["problem", "symptom", "incumbent", "adjacent", "workaround", "role"] as QueryKind[]).includes(q.kind)
      ? q.kind
      : "problem";
    // A model-chosen recency of, say, 30 days would silently empty a slow niche; snapping to the
    // three sanctioned buckets keeps the window predictable.
    const recencyDays = [90, 365, 1825].includes(q.recencyDays) ? q.recencyDays : DEFAULT_RECENCY[kind];
    const intentFilter = (q.intentFilter ?? []).filter((t): t is IntentType => INTENT_TYPES.includes(t as IntentType));

    out.push({
      text,
      kind,
      intentFilter: intentFilter.length ? intentFilter : KIND_DEFAULT_FILTER[kind],
      recencyDays,
      weight: Number.isFinite(q.weight) ? Math.max(0.1, Math.min(1, q.weight)) : 0.6,
    });
  }
  return out;
}

/**
 * A plan built without a model, from the lexicon we already have. Used when the planner call fails
 * or there is no time left for it — a degraded plan searches less ground, but the run still returns
 * people rather than failing.
 */
export function fallbackPlan(opts: { seekingPhrases: string[]; problemPhrases: string[]; incumbents?: string[] }): PlannedQuery[] {
  const queries: PlannedQuery[] = [];
  for (const p of opts.seekingPhrases.slice(0, 6)) {
    queries.push({ text: p, kind: "problem", intentFilter: [], recencyDays: 1825, weight: 0.9 });
  }
  for (const p of opts.problemPhrases.slice(0, 6)) {
    queries.push({ text: p, kind: "symptom", intentFilter: [], recencyDays: 365, weight: 0.8 });
  }
  for (const name of (opts.incumbents ?? []).slice(0, 4)) {
    queries.push({
      text: `${name} alternative`,
      kind: "incumbent",
      intentFilter: ["switching_away", "evaluating_alternatives"],
      recencyDays: 365,
      weight: 0.85,
    });
  }
  return sanitizePlan(queries);
}

export async function planQueries(opts: { brief: Brief; timeoutMs?: number }): Promise<PlannedQuery[]> {
  const { brief, timeoutMs = 12_000 } = opts;
  const result = await getAnthropic().messages.parse(
    {
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(brief, null, 2) }],
      output_config: { effort: "low", format: zodOutputFormat(PlanSchema) },
    },
    { timeout: timeoutMs },
  );
  return sanitizePlan((result.parsed_output?.queries ?? []) as PlannedQuery[]);
}

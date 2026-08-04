import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import type { IntentType } from "../search/intent";

// Stage 3 of the intent cascade. See spec §3.3.
//
// Only 1-3% of raw crawled volume reaches here, which is what makes an LLM call affordable at
// corpus scale. This stage does not merely classify — it EXTRACTS the structure that makes a
// document retrievable and rankable.
//
// The most important output is `problemStatement`, and the reason is worth stating plainly: the
// raw post is written in the author's idiosyncratic voice, while the normalised statement is
// written in a consistent neutral register — the same register the query planner emits. Embedding
// the statement alongside the body deliberately collapses the vocabulary gap between how people
// complain and how founders describe their product. That gap is why naive semantic search on raw
// posts underperforms.

// Haiku, not Sonnet, and this was a cost decision made against a real bill.
//
// Classification ran on Sonnet at 12 batches a tick during backlog catch-up and burned ~$150 in a
// day. It is the only paid step in the worker and it runs forever, so the model choice here is the
// single biggest lever on what this product costs to operate.
//
// The task suits a small model: it is structured extraction against a zod schema — pick one of
// seven intent types, restate the problem in one line, pull out named products and a role. It is
// not open-ended reasoning. The place quality could slip is `problemStatement`, which feeds the
// embedding, so watch the leads/none ratio in the worker logs after this change: batches have been
// running 25-30% leads, and a sharp move in either direction means the model is judging
// differently rather than the corpus having changed.
export const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
export const CLASSIFIER_VERSION = `${CLASSIFIER_MODEL}/v1`;

export const CLASSIFY_BATCH_SIZE = 20;

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("The input id, echoed exactly."),
      intentType: z.enum([
        "seeking_tool",
        "describing_pain",
        "evaluating_alternatives",
        "switching_away",
        "building_workaround",
        "hiring_for_problem",
        "none",
      ]),
      confidence: z.number().describe("0.0-1.0."),
      problemStatement: z
        .string()
        .describe(
          "ONE sentence, present tense, neutral third person, describing what the author needs. Empty string if not a lead.",
        ),
      namedProducts: z.array(z.string()).describe("Products the author names as ones they use or considered. Empty if none."),
      // Deliberately permissive strings rather than z.enum, and this is not laziness.
      //
      // These were enums, and in production the model occasionally returned a role outside the list
      // ("engineer", "student", "researcher"). Zod then rejected the WHOLE response, so one
      // out-of-vocabulary word on document 14 destroyed the other 19 perfectly good
      // classifications — and the batch retried forever, paying for a full model call each time.
      //
      // These two fields are descriptive metadata that nothing gates on, so an unrecognised value
      // is worth normalising away, never worth losing a batch over. Normalisation happens below.
      roleGuess: z.string().describe("One of: founder, developer, marketer, ops, designer, sales, consumer, unknown."),
      companyContext: z.string().describe("Short freeform, e.g. '3-person agency'. Empty string if unclear."),
      urgency: z.string().describe("One of: now, evaluating, someday, unknown."),
    }),
  ),
});

const ROLES = ["founder", "developer", "marketer", "ops", "designer", "sales", "consumer", "unknown"];
const URGENCIES = ["now", "evaluating", "someday", "unknown"];

/** Coerces a free-text answer onto the known vocabulary, falling back to "unknown". */
export function normalizeChoice(value: string | undefined, allowed: string[]): string {
  const v = (value ?? "").trim().toLowerCase();
  if (allowed.includes(v)) return v;
  // Near-misses are common and cheap to rescue: "ops manager" -> "ops", "software developer" ->
  // "developer". Only accepted when exactly one option matches, so an ambiguous answer still
  // becomes "unknown" rather than being guessed at.
  const hits = allowed.filter((a) => a !== "unknown" && v.includes(a));
  return hits.length === 1 ? hits[0] : "unknown";
}

const SYSTEM = [
  "You classify forum and social posts for a lead-generation index. For each post, determine whether",
  "the author is expressing a problem, need, or dissatisfaction that a software product could",
  "plausibly address — and if so, extract structure.",
  "",
  "You are strict. Most posts are not leads. Posts that describe a problem in the abstract, discuss",
  "news, offer advice to others, or promote something are NOT leads. The author must be describing",
  "THEIR OWN situation.",
  "",
  "intentType must be one of:",
  "  seeking_tool            — explicitly asking for a product or recommendation",
  "  describing_pain         — describing their own problem without asking for a tool",
  "  evaluating_alternatives — comparing named products for their own use",
  "  switching_away          — dissatisfied with a named incumbent they currently use",
  "  building_workaround     — built or is building something custom to fill a gap",
  "  hiring_for_problem      — hiring a person to do work a product could do",
  "  none                    — not a lead",
  "",
  "problemStatement must be written in a NEUTRAL THIRD PERSON register, not the author's voice.",
  "Write 'needs a way to schedule inbound deliveries without a spreadsheet', never 'I need...' and",
  "never marketing language. This string is embedded for retrieval, so consistency of register",
  "matters more than fidelity to their phrasing.",
  "",
  "Return a verdict for every id you were given, in input order.",
].join("\n");

export type ClassifyInput = {
  id: string;
  platform: string;
  title?: string;
  body: string;
  postedAt: Date;
};

export type Verdict = {
  id: string;
  intentType: IntentType;
  confidence: number;
  problemStatement: string;
  namedProducts: string[];
  roleGuess: string;
  companyContext: string;
  urgency: string;
};

/**
 * Classifies a batch. Batching is what makes this affordable — 20 posts per call amortises the
 * system prompt across the whole batch instead of paying it 20 times.
 *
 * Returns verdicts for whatever came back. A document the model omitted gets no verdict rather
 * than a guessed one, and the caller leaves it unclassified for the next pass.
 */
export async function classifyBatch(opts: { documents: ClassifyInput[]; timeoutMs?: number }): Promise<Verdict[]> {
  const { documents, timeoutMs = 60_000 } = opts;
  if (documents.length === 0) return [];

  const content = documents
    .map(
      (d) =>
        `<post id="${d.id}" platform="${d.platform}" posted="${d.postedAt.toISOString().slice(0, 10)}">\n${
          d.title ? `${d.title}\n` : ""
        }${d.body.slice(0, 1200)}\n</post>`,
    )
    .join("\n\n");

  const result = await getAnthropic().messages.parse(
    {
      model: CLASSIFIER_MODEL,
      // 2500, down from 8000. Output is billed and 20 verdicts do not need eight thousand tokens —
      // the ceiling was never reached, it just left room for a runaway response to be paid for.
      max_tokens: 2500,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      // No `effort` here. It is a Claude 5-family parameter and Haiku rejects the whole request
      // with `400 "This model does not support the effort parameter"` — which is a rejection of our
      // REQUEST, not of any document in it, and cost 600 documents a retry attempt before it was
      // caught. `format` is supported on both.
      output_config: { format: zodOutputFormat(VerdictSchema) },
    },
    { timeout: timeoutMs },
  );

  const known = new Set(documents.map((d) => d.id));
  return (result.parsed_output?.verdicts ?? [])
    .filter((v) => known.has(v.id))
    .map((v) => ({
      ...v,
      intentType: v.intentType as IntentType,
      confidence: Math.max(0, Math.min(1, v.confidence)),
      roleGuess: normalizeChoice(v.roleGuess, ROLES),
      urgency: normalizeChoice(v.urgency, URGENCIES),
    }));
}

/**
 * Whether a verdict belongs in the review queue that retrains Stage 2.
 *
 * The band is the model's own uncertainty. Labelling 50 of these a week is what lets the Stage 2
 * threshold rise safely, which cuts Stage 3 spend — the flywheel compounds, and it is the only
 * standing work in the whole pipeline worth doing by hand.
 */
export function needsReview(v: Verdict): boolean {
  return v.confidence >= 0.4 && v.confidence <= 0.7;
}

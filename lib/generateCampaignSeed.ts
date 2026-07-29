import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./anthropic";

const SeedLeadSchema = z.object({
  name: z.string().describe("Realistic full name."),
  buyerIndex: z.number().int().describe("0-based index into the buyer personas list — which persona this lead matches."),
  role: z.string().describe("Short job title, 1-3 words, e.g. 'Ops manager'."),
  company: z.string().describe("Short company descriptor with a size, under 8 words, e.g. '60-person 3PL, Memphis'."),
  detail: z.string().describe("HARD LIMIT 12 words: the specific signal that makes them a lead right now. No sub-clauses."),
  source: z.string().describe("HARD LIMIT 4 words naming where this was seen, e.g. 'r/freelance' or 'Job ad'. Not a full sentence."),
  email: z
    .string()
    .nullable()
    .describe(
      "A real-looking email ONLY if this specific source would plausibly reveal one (e.g. a job listing naming a company domain, or a lead who already replied and shared contact info). null for anyone found via an anonymous social post — most leads should be null.",
    ),
  quote: z.string().nullable().describe("HARD LIMIT 30 words, in their own voice, or null if this lead has no direct quote (e.g. found via a job posting)."),
  quoteMeta: z.string().nullable().describe("HARD LIMIT 8 words of engagement meta, e.g. '34 comments · she replied to four', or null if quote is null."),
  subject: z.string().describe("HARD LIMIT 8 words, subject-line style, e.g. 're: four trucks before 7am'. Empty string only if dropped is true."),
  draft: z
    .string()
    .describe(
      "The actual outreach message: EXACTLY 2 short sentences, hard limit 320 characters total. Warm, specific, references their real situation, never a hard sell. Empty string only if dropped is true.",
    ),
  timeSensitive: z.boolean().describe("True for exactly the 2 highest-signal leads (posted very recently) — everyone else false."),
  dropped: z.boolean().describe("True for exactly one low-signal lead with nothing specific enough to say yet — everyone else false."),
});

const SeedSchema = z.object({
  leads: z.array(SeedLeadSchema).min(5).max(6),
  communities: z
    .array(
      z.object({
        name: z.string().describe("Community name with platform, e.g. 'Ops Nerds · Slack'."),
        platform: z.string().describe("One word: Slack, Reddit, Discord, Forum, Newsletter, or X."),
        members: z.string().describe("HARD LIMIT 4 words, e.g. '1.2k members'."),
        fit: z.enum(["Strong fit", "Weak", "Untested"]),
        note: z.string().describe("HARD LIMIT one sentence, under 25 words: what real participation looks like here."),
      }),
    )
    .min(3)
    .max(4),
});

export type GeneratedSeed = z.infer<typeof SeedSchema>;

export async function generateCampaignSeed(input: {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
}): Promise<GeneratedSeed> {
  const enabledChannels = Object.entries(input.channels)
    .filter(([, on]) => on)
    .map(([key]) => key);

  const result = await getAnthropic().messages.parse({
    model: "claude-opus-5",
    max_tokens: 4000,
    thinking: { type: "disabled" },
    system:
      "You are Kylani, a lead-gen assistant. Given a product and its buyer personas, invent a realistic, varied " +
      "starter set of leads and communities as if Kylani had already been searching for a few days. " +
      "Every lead must be concrete and specific to THIS product — no generic filler, no repeated phrasing across leads. " +
      "Drafts are written in a founder's own voice: casual, short, reference something real about that person, never salesy. " +
      "Every field has a hard length limit in its description — those are strict maximums, not suggestions. " +
      "Write like sparse UI copy, not a report: short, punchy, no run-on sentences or sub-clauses.",
    messages: [
      {
        role: "user",
        content: [
          `Product site: ${input.url}`,
          `What they sell: ${input.whatYouSell}`,
          `Buyer personas, indices 0-${input.buyers.length - 1} (most likely first): ${input.buyers.map((b, i) => `${i}: ${b.name} — ${b.desc}`).join(" | ")}`,
          `Channels the founder has enabled: ${enabledChannels.join(", ") || "email only"}`,
        ].join("\n"),
      },
    ],
    output_config: {
      effort: "low",
      format: zodOutputFormat(SeedSchema),
    },
  });

  if (!result.parsed_output) {
    throw new Error("Campaign seed generation failed to parse.");
  }
  return result.parsed_output;
}

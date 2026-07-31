import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./anthropic";
import { categoryGuidance } from "./productCategories";
import { expandSearchQueries } from "./searchQueries";

const SeedLeadSchema = z.object({
  name: z
    .string()
    .describe(
      "The person's REAL name if the source shows one, otherwise their real handle/username exactly as posted (e.g. 'u/throwaway3PL'). Never invent a realistic-sounding name to replace an anonymous handle.",
    ),
  buyerIndex: z.number().int().describe("0-based index into the buyer personas list — which persona this lead matches."),
  role: z.string().describe("Short job title, 1-3 words, e.g. 'Ops manager'. Infer only from what the real post/profile actually states or clearly implies."),
  company: z
    .string()
    .describe("Short company descriptor with a size, under 8 words, e.g. '60-person 3PL, Memphis'. Only include specifics the source actually gives — say 'unknown' rather than guessing a number."),
  detail: z.string().describe("HARD LIMIT 12 words: the specific real signal from the actual post that makes them a lead right now. No sub-clauses."),
  source: z.string().describe("HARD LIMIT 4 words naming where this was actually found, e.g. 'r/freelance' or 'Job ad'. Not a full sentence."),
  sourceUrl: z
    .string()
    .nullable()
    .describe("The real, exact URL of the post/thread/listing you found via web_search. null only if a direct URL genuinely isn't available (e.g. a private Slack you can't link to)."),
  email: z
    .string()
    .nullable()
    .describe(
      "A real email ONLY if the source itself actually shows one (e.g. a job listing naming a company domain, or contact info in a public profile). null for every anonymous social post — never invent or guess an email address.",
    ),
  quote: z
    .string()
    .nullable()
    .describe("HARD LIMIT 30 words, quoted or closely paraphrased from the REAL post you found — never invented. null if this lead has no direct quote (e.g. found via a job posting)."),
  quoteMeta: z.string().nullable().describe("HARD LIMIT 8 words of real engagement meta actually visible on the post (comment count, etc.), or null if not available."),
  subject: z.string().describe("HARD LIMIT 8 words, subject-line style, e.g. 're: four trucks before 7am'. Empty string only if dropped is true."),
  draft: z
    .string()
    .describe(
      "The actual outreach message: EXACTLY 2 short sentences, hard limit 320 characters total. Warm, specific, references what this real person actually said or did, never a hard sell. Empty string only if dropped is true.",
    ),
  timeSensitive: z.boolean().describe("True for the highest-signal, most recently posted leads — everyone else false."),
  dropped: z.boolean().describe("True for a lead with a real signal but nothing specific enough yet to draft — everyone else false."),
});

const SeedSchema = z.object({
  leads: z
    .array(SeedLeadSchema)
    .max(8)
    .describe(
      "Only leads backed by a real post/thread/listing you actually found via web_search. If you can only verify 2 real leads, return 2 — never pad the list with invented ones to hit a target count.",
    ),
  communities: z
    .array(
      z.object({
        name: z.string().describe("The real community's actual name with platform, e.g. 'r/sysadmin · Reddit', confirmed to exist via web_search."),
        platform: z.string().describe("One word: Slack, Reddit, Discord, Forum, Newsletter, or X."),
        members: z
          .string()
          .describe("HARD LIMIT 4 words, e.g. '1.2k members' — use the real member count if web_search surfaces one, otherwise 'size unknown'. Never invent a number."),
        fit: z.enum(["Strong fit", "Weak", "Untested"]),
        note: z.string().describe("HARD LIMIT one sentence, under 25 words: what real participation looks like here, based on what you actually saw there."),
      }),
    )
    .max(6)
    .describe("Only communities you actually confirmed exist via web_search — real subreddits, real Slack/Discord communities, real forums. Fewer real ones beats padding with guesses."),
});

export type GeneratedSeed = z.infer<typeof SeedSchema>;

export async function generateCampaignSeed(input: {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category?: string;
  keywords?: string[];
}): Promise<GeneratedSeed> {
  const enabledChannels = Object.entries(input.channels)
    .filter(([, on]) => on)
    .map(([key]) => key);

  const { communityQueries, peopleQueries, totalCandidates } = expandSearchQueries({
    keywords: input.keywords ?? [],
    buyers: input.buyers,
  });

  const result = await getAnthropic().messages.parse({
    model: "claude-opus-5",
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
    system:
      "You are Kylani, a lead-gen assistant. Given a product and its buyer personas, use the web_search tool to actually " +
      "find REAL communities and REAL people who match the buyer personas and show a real, current signal of the " +
      "underlying problem. This is real research, not creative writing — every lead and every community in your output " +
      "must come from something you actually found via search, with a real quote and, where possible, a real URL. Do " +
      "not invent people, quotes, companies, or community stats to fill out a list — returning fewer, verified results " +
      "is strictly better than padding with fabricated ones. " +
      "WORK IN TWO PHASES, in this order: " +
      "PHASE 1 — COMMUNITIES FIRST. Before looking for individuals, spend your first several searches finding and " +
      "confirming real communities: subreddits, forums, Slack/Discord servers, job boards, newsletters where this " +
      "buyer actually congregates. This tells you WHERE to look next, and populates `communities` directly. " +
      "PHASE 2 — PEOPLE SECOND. Using what Phase 1 told you (specific subreddit/forum names, confirmed venues), spend " +
      "the rest of your searches finding actual individual posts, threads, and listings inside those specific venues — " +
      "this populates `leads`. Searching a named subreddit or forum you just confirmed exists beats a generic search. " +
      "A candidate pool of real search queries was generated from this product's actual problem language (" +
      totalCandidates +
      " combinations total) — a sample from each phase is listed below. Use them as concrete starting points, adapt " +
      "wording as needed, and don't feel bound to run them verbatim or use only these. " +
      "IMPORTANT — know what's actually searchable: Reddit, public forums, job boards (LinkedIn/Indeed job postings), " +
      "and X/Twitter are publicly indexed, so web_search can surface REAL individual posts, threads, and listings there " +
      "— these are your best sources for actual leads with a quote. Slack and Discord are different: the messages " +
      "inside them are private and NOT web-searchable, so web_search can only confirm a Slack/Discord COMMUNITY exists " +
      "(via directories or 'best X Slack communities' roundups) — never expect to find an individual member's post " +
      "inside one. If a Slack/Discord community looks like a fit, add it to `communities`, but source actual `leads` " +
      "from Reddit, forums, job boards, or X instead. " +
      "Be persistent before concluding there's nothing: if your first search or two don't surface anything concrete, " +
      "don't stop there — try a different query from the candidate pool, a different subreddit or forum, or a " +
      "different buyer persona before giving up. Spend most of your search budget actually looking, not economizing " +
      "early; a handful of unproductive searches is expected and fine. Try to cover more than just the single top " +
      "buyer persona if you have budget left — a real lead for a secondary persona beats a fourth search repeating " +
      "the first one. " +
      "You're working under a tight time budget — you have up to 8 searches across both phases, so spend them on the " +
      "most promising candidates from the pool above rather than spreading thin. Use as many as genuinely useful " +
      "rather than stopping after just one or two, but don't expect to exhaustively cover every channel. " +
      categoryGuidance(input.category) +
      " Every field has a hard length limit in its description — those are strict maximums, not suggestions. " +
      "Write like sparse UI copy, not a report: short, punchy, no run-on sentences or sub-clauses.",
    messages: [
      {
        role: "user",
        content: [
          `Product site: ${input.url}`,
          `What they sell: ${input.whatYouSell}`,
          `Buyer personas, indices 0-${input.buyers.length - 1} (most likely first): ${input.buyers.map((b, i) => `${i}: ${b.name} — ${b.desc}`).join(" | ")}`,
          `Channels the founder has enabled to search: ${enabledChannels.join(", ") || "email only — search broadly for public posts regardless of platform"}`,
          input.keywords?.length
            ? `Real phrases people actually use for this problem (found during the earlier site analysis): ${input.keywords.join(" | ")}`
            : null,
          `PHASE 1 candidate queries — communities: ${communityQueries.join(" | ")}`,
          `PHASE 2 candidate queries — people: ${peopleQueries.join(" | ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
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

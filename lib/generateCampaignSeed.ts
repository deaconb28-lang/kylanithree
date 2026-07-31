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

const SeedCommunitySchema = z.object({
  name: z.string().describe("The real community's actual name with platform, e.g. 'r/sysadmin · Reddit', confirmed to exist via web_search."),
  platform: z.string().describe("One word: Slack, Reddit, Discord, Forum, Newsletter, or X."),
  members: z
    .string()
    .describe("HARD LIMIT 4 words, e.g. '1.2k members' — use the real member count if web_search surfaces one, otherwise 'size unknown'. Never invent a number."),
  fit: z.enum(["Strong fit", "Weak", "Untested"]),
  note: z.string().describe("HARD LIMIT one sentence, under 25 words: what real participation looks like here, based on what you actually saw there."),
});

const CommunitiesSchema = z.object({
  communities: z
    .array(SeedCommunitySchema)
    .max(6)
    .describe("Only communities you actually confirmed exist via web_search — real subreddits, real Slack/Discord communities, real forums. Fewer real ones beats padding with guesses."),
});

const LeadsSchema = z.object({
  leads: z
    .array(SeedLeadSchema)
    .max(8)
    .describe(
      "Only leads backed by a real post/thread/listing you actually found via web_search. If you can only verify 2 real leads, return 2 — never pad the list with invented ones to hit a target count.",
    ),
});

export type GeneratedSeed = { leads: z.infer<typeof SeedLeadSchema>[]; communities: z.infer<typeof SeedCommunitySchema>[] };

type SeedInput = {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category?: string;
  keywords?: string[];
};

const SEARCHABLE_NOTE =
  "Know what's actually searchable: Reddit, public forums, job boards (LinkedIn/Indeed), and X/Twitter are publicly " +
  "indexed, so web_search surfaces REAL individual posts, threads, and listings there — your best sources for actual " +
  "leads with a quote. Slack and Discord are different: messages inside them are private and NOT web-searchable, so " +
  "web_search can only confirm a Slack/Discord COMMUNITY exists (directories, 'best X Slack communities' roundups) — " +
  "never expect to find an individual member's post inside one.";

// PHASE 1 — communities only. Small, fast, cheap: a handful of searches just to find and confirm
// where this buyer actually congregates, before spending any budget looking for individuals. Kept
// as its own API call (not a tool-use round inside a bigger call) so it fits comfortably inside a
// single Vercel request well under the 60s Hobby ceiling, and so its result (real, confirmed
// community names) can be handed to Phase 2 as concrete search targets instead of guesses.
export async function searchCommunities(input: SeedInput): Promise<{ communities: GeneratedSeed["communities"] }> {
  const enabledChannels = Object.entries(input.channels)
    .filter(([, on]) => on)
    .map(([key]) => key);
  const { communityQueries, totalCandidates } = expandSearchQueries({ keywords: input.keywords ?? [], buyers: input.buyers });

  const result = await getAnthropic().messages.parse({
    model: "claude-opus-5",
    max_tokens: 5000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    system:
      "You are Kylani, a lead-gen assistant. Your ONLY job right now is to find and confirm REAL communities — " +
      "subreddits, forums, Slack/Discord servers, job boards, newsletters — where the given buyer personas actually " +
      "congregate. Do not look for individual people or posts yet, that happens in a later step. " +
      "This is real research, not creative writing: every community in your output must be one you actually " +
      "confirmed exists via web_search. Returning fewer, verified communities beats padding with guesses. " +
      SEARCHABLE_NOTE +
      " You have a tight budget — up to 4 searches total, so pick the most promising candidates below rather than " +
      "spreading thin, and don't feel bound to run them verbatim. " +
      categoryGuidance(input.category) +
      " Every field has a hard length limit in its description — those are strict maximums. Write like sparse UI " +
      "copy: short, punchy, no run-on sentences.",
    messages: [
      {
        role: "user",
        content: [
          `Product site: ${input.url}`,
          `What they sell: ${input.whatYouSell}`,
          `Buyer personas, indices 0-${input.buyers.length - 1} (most likely first): ${input.buyers.map((b, i) => `${i}: ${b.name} — ${b.desc}`).join(" | ")}`,
          `Channels the founder has enabled: ${enabledChannels.join(", ") || "email only — search broadly regardless of platform"}`,
          input.keywords?.length ? `Real phrases people actually use for this problem: ${input.keywords.join(" | ")}` : null,
          `Candidate community queries (${totalCandidates} total combinations, a sample): ${communityQueries.join(" | ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(CommunitiesSchema) },
  });

  if (!result.parsed_output) throw new Error("Community search failed to parse.");
  return result.parsed_output;
}

// PHASE 2 — people, using Phase 1's confirmed communities as concrete search targets (e.g. "search
// r/smallcapinvesting for people asking for stock picks" beats a generic "finance reddit" search).
// Its own separate API call/request for the same reason as Phase 1: a fresh ~60s budget, and a
// smaller, cheaper schema (leads only) that generates faster than the old combined call.
export async function searchPeople(input: SeedInput & { communities: GeneratedSeed["communities"] }): Promise<{ leads: GeneratedSeed["leads"] }> {
  const enabledChannels = Object.entries(input.channels)
    .filter(([, on]) => on)
    .map(([key]) => key);
  const { peopleQueries, totalCandidates } = expandSearchQueries({ keywords: input.keywords ?? [], buyers: input.buyers });

  const confirmedCommunities = input.communities.length
    ? input.communities.map((c) => `${c.name} (${c.platform})`).join(" | ")
    : "none confirmed yet — search broadly across Reddit, forums, job boards, and X instead";

  const result = await getAnthropic().messages.parse({
    model: "claude-opus-5",
    max_tokens: 9000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    system:
      "You are Kylani, a lead-gen assistant. Find REAL individual people — actual posts, threads, or job listings — " +
      "who match the buyer personas below and show a real, current signal of the underlying problem. This is real " +
      "research, not creative writing: every lead must come from something you actually found via web_search, with " +
      "a real quote and, where possible, a real URL. Never invent people, quotes, companies, or stats to fill out a " +
      "list — returning fewer, verified leads is strictly better than padding with fabricated ones. " +
      "Follow this chain per persona, concretely: pick the buyer persona -> pick one of the search queries below or " +
      "a close variant -> run it against the most relevant platform (Reddit, a named forum, a job board, or X) -> " +
      "if it's a subreddit or forum, go one level deeper into a specific real thread that actually has a matching " +
      "poster -> extract that lead with their real quote and URL. Also try a couple of plain, generic problem-phrase " +
      "searches (the way someone would type it into Google), not just site-specific ones — real complaints and " +
      "questions surface that way too. " +
      "Already-confirmed real communities from an earlier step (search inside these first, they're not guesses): " +
      confirmedCommunities +
      ". " +
      SEARCHABLE_NOTE +
      " You have a tight budget — up to 6 searches total. Be persistent: if your first search or two don't surface " +
      "anything concrete, try a different query or persona before giving up, but don't exhaustively cover every " +
      "channel. Try to cover more than just the single top persona if you have budget left. " +
      categoryGuidance(input.category) +
      " Every field has a hard length limit in its description — those are strict maximums. Write like sparse UI " +
      "copy: short, punchy, no run-on sentences or sub-clauses.",
    messages: [
      {
        role: "user",
        content: [
          `Product site: ${input.url}`,
          `What they sell: ${input.whatYouSell}`,
          `Buyer personas, indices 0-${input.buyers.length - 1} (most likely first): ${input.buyers.map((b, i) => `${i}: ${b.name} — ${b.desc}`).join(" | ")}`,
          `Channels the founder has enabled: ${enabledChannels.join(", ") || "email only — search broadly regardless of platform"}`,
          input.keywords?.length ? `Real phrases people actually use for this problem: ${input.keywords.join(" | ")}` : null,
          `Candidate people-finding queries (${totalCandidates} total combinations, a sample): ${peopleQueries.join(" | ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(LeadsSchema) },
  });

  if (!result.parsed_output) throw new Error("People search failed to parse.");
  return result.parsed_output;
}

// Combined convenience wrapper for callers that need one result and aren't on the tight,
// user-facing critical path (the "search again" action on an existing campaign, and the fallback
// finalizeOnboarding takes if a client ever arrives with no pre-computed seed). The real onboarding
// flow (Step5Search) calls searchCommunities/searchPeople as two separate requests instead, so each
// gets its own fresh ~60s budget rather than sharing one — see those functions' comments.
export async function generateCampaignSeed(input: SeedInput): Promise<GeneratedSeed> {
  const { communities } = await searchCommunities(input);
  const { leads } = await searchPeople({ ...input, communities });
  return { leads, communities };
}

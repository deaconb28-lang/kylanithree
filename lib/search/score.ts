import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import type { Candidate, DropReason, IntentTier, ScoredLead } from "./types";

// Stage 4 — the expensive pass, and the only model call in the extraction path. It sees ONLY the
// candidates that survived the cheap filter, and it judges text we supply rather than going and
// finding text itself. That inversion is what makes the excerpt verifiable: because we hold the
// real post body, a returned quote can be checked as a literal span of it and dropped when it
// isn't, which no amount of prompting can guarantee on its own.
//
// Classification over supplied text is not a job that needs Opus — Sonnet is materially faster
// here and the latency budget is the point, so this call runs without tools and without thinking.

const ScoreSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("The candidate id exactly as given."),
      keep: z.boolean().describe("True only if this person is genuinely expressing the problem. False for off-topic, vendors, or people merely discussing the category."),
      intentTier: z
        .enum(["seeking", "complaining", "adjacent"])
        .describe(
          "'seeking' = actively looking for a solution or asking for recommendations right now. 'complaining' = describing the problem as a live pain but not shopping. 'adjacent' = related interest, no direct expression of this problem.",
        ),
      confidence: z.number().describe("0 to 1. How sure you are this is a real expression of the problem."),
      buyerIndex: z.number().int().describe("0-based index of the buyer persona this person best matches."),
      excerpt: z
        .string()
        .describe(
          "A VERBATIM span copied character-for-character from that candidate's body text — the sentence where they express the problem. Never paraphrase, never reword, never join two separate sentences. Max 240 characters. If no such sentence exists, set keep=false and return an empty string.",
        ),
    }),
  ),
});

// Normalizing whitespace only — never case, never punctuation. The excerpt has to be the person's
// actual words; loosening this check would defeat the point of having it.
function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function isVerbatim(excerpt: string, body: string) {
  const e = normalize(excerpt);
  if (e.length < 15) return false;
  return normalize(body).includes(e);
}

export type ScoreResult = {
  leads: ScoredLead[];
  drops: Partial<Record<DropReason, number>>;
};

export async function scoreCandidates(opts: {
  candidates: Candidate[];
  whatYouSell: string;
  problem: string;
  buyers: { name: string; desc: string }[];
  maxLeads?: number;
}): Promise<ScoreResult> {
  const { candidates, whatYouSell, problem, buyers, maxLeads = 25 } = opts;
  const drops: Partial<Record<DropReason, number>> = {};
  if (candidates.length === 0) return { leads: [], drops };

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const result = await getAnthropic().messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system:
      "You are Kylani's lead qualifier. You are given a product, the problem it removes, its buyer personas, and a " +
      "numbered list of real posts pulled from online communities. For EVERY post, decide whether that person is " +
      "genuinely expressing the problem this product solves. " +
      "Judge meaning, not keywords: a post that merely mentions the topic, discusses the industry in general, shares " +
      "news, or asks something unrelated is NOT a lead — set keep=false. Someone describing their own situation, " +
      "asking for recommendations, or venting about this exact pain IS a lead. " +
      "Vendors, marketers, and people promoting their own product are never leads. " +
      "The `excerpt` must be copied verbatim from that post's body — character for character, a single continuous " +
      "span. It is automatically verified against the original text and the lead is discarded if it does not match " +
      "exactly, so do not paraphrase, tidy, or stitch sentences together. " +
      "Return a verdict for every id you were given, in the same order. Be strict: it is far better to keep 5 real " +
      "leads than to pass 20 weak ones.",
    messages: [
      {
        role: "user",
        content: [
          `Product: ${whatYouSell}`,
          `Problem it removes: ${problem}`,
          `Buyer personas (index: name — description):\n${buyers.map((b, i) => `${i}: ${b.name} — ${b.desc}`).join("\n")}`,
          "",
          "Posts to judge:",
          ...candidates.map(
            (c) =>
              `---\nid: ${c.id}\nvenue: ${c.venueName}\nposted: ${c.postedAt.toISOString().slice(0, 10)}\ntitle: ${c.title}\nbody: ${c.body.slice(0, 1200)}`,
          ),
        ].join("\n"),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(ScoreSchema) },
  });

  if (!result.parsed_output) throw new Error("Lead scoring failed to parse.");

  const leads: ScoredLead[] = [];
  for (const v of result.parsed_output.verdicts) {
    const c = byId.get(v.id);
    if (!c) continue;
    if (!v.keep || v.intentTier === "adjacent") {
      drops.no_intent = (drops.no_intent ?? 0) + 1;
      continue;
    }
    if (!isVerbatim(v.excerpt, `${c.title}\n${c.body}`)) {
      drops.excerpt_not_verbatim = (drops.excerpt_not_verbatim ?? 0) + 1;
      continue;
    }
    leads.push({
      ...c,
      intentTier: v.intentTier as IntentTier,
      confidence: Math.max(0, Math.min(1, v.confidence)),
      excerpt: normalize(v.excerpt).slice(0, 240),
      buyerIndex: Number.isInteger(v.buyerIndex) && v.buyerIndex >= 0 && v.buyerIndex < buyers.length ? v.buyerIndex : 0,
    });
  }

  // Someone actively shopping outranks someone venting; recency breaks ties within a tier. No
  // padding — if only a handful survive, a handful is what ships.
  const tierRank: Record<IntentTier, number> = { seeking: 0, complaining: 1, adjacent: 2 };
  leads.sort((a, b) => tierRank[a.intentTier] - tierRank[b.intentTier] || b.postedAt.getTime() - a.postedAt.getTime());

  return { leads: leads.slice(0, maxLeads), drops };
}

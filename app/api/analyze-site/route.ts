import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/anthropic";
import { toUserError } from "@/lib/apiError";
import { htmlToText } from "@/lib/htmlText";

// This route combines an external site fetch with a Claude call, which can
// exceed the platform's default serverless function timeout (10s on Vercel
// Hobby) — raise it explicitly so the request has room to actually finish.
export const maxDuration = 60;

const AnalysisSchema = z.object({
  whatYouSell: z.string().describe("Exactly one short sentence (under 20 words) describing the product, the way a founder would say it out loud."),
  problem: z.string().describe("Exactly one sentence (under 25 words) naming the specific problem this product removes for its buyer."),
  siteSummary: z
    .string()
    .describe(
      "A real, specific 2-3 sentence summary (hard limit 60 words) of what you actually found reading and researching this site — like a sharp colleague's quick take, not marketing copy. Mention what it does, who it's clearly built for, and one concrete, specific detail you noticed (a pricing model, a design choice, a feature, a tone) that shows you actually looked rather than guessed. Never generic filler like 'this is a great tool for businesses' — be as specific as the evidence allows.",
    ),
  buyers: z
    .array(
      z.object({
        key: z.string().describe("Short lowercase slug, e.g. 'ops' or 'warehouse'."),
        name: z.string().describe("Job title of this buyer persona, 1-4 words."),
        tag: z.string().nullable().describe("'Most likely' for exactly one buyer (the top guess), otherwise null."),
        desc: z
          .string()
          .describe(
            "Exactly ONE sentence, hard limit 140 characters: what they own and why they'd feel this problem. Do not add a second sentence about confidence — that belongs in `tag`, not here.",
          ),
        where: z
          .string()
          .describe(
            "Context for this buyer, under 8 words: company type and size range for a B2B buyer (e.g. 'Third-party logistics, 20–200 people'), or a lifestyle/demographic descriptor for an individual consumer (e.g. 'Urban renters, cooks 3+ times a week').",
          ),
      }),
    )
    .min(2)
    .max(4),
  keywords: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "Real phrases you found people actually typing or saying via web_search — search queries, forum post titles, or complaint language — never invented. 2-6 words each, e.g. 'dock scheduling spreadsheet mess'. These seed the next stage's lead search, so make them the actual words real people use, not marketing language.",
    ),
  nicheKey: z
    .string()
    .describe(
      "A short lowercase kebab-case slug naming the BUYER+PROBLEM niche, not this specific company — e.g. 'retail-investing-newsletter' or 'warehouse-dock-scheduling'. Two different companies selling to the same buyer about the same problem must produce the SAME slug, because this is a shared cache key for community resolution. 2-4 words.",
    ),
  problemPhrases: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "Short phrases (2-6 words) a sufferer would type while COMPLAINING about this problem, in their own words, never marketing language — e.g. 'trucks stacking up at receiving'. Used as literal community search queries, so favour natural spoken phrasing over jargon.",
    ),
  seekingPhrases: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "Short phrases (2-6 words) someone would type when ACTIVELY LOOKING for a solution — e.g. 'dock scheduling software recommendations' or 'alternative to spreadsheet scheduling'. These find people ready to buy, so they matter most.",
    ),
  negativeTerms: z
    .array(z.string())
    .min(2)
    .max(8)
    .describe(
      "Words/phrases whose presence in a post signals it is NOT a buyer — vendor marketing, press-release, or affiliate language specific to this space (e.g. 'our platform', 'book a demo', 'sponsored'). Used to discard noise before scoring.",
    ),
  relevanceWindowDays: z
    .number()
    .int()
    .describe(
      "How many days old a post can be and still be a live lead IN THIS NICHE. Fast-moving markets (finance, crypto, news, hiring, consumer trends) decay in 7-30 days. Durable operational or B2B infrastructure problems stay relevant 90-180 days. Choose from the niche's actual pace, not a default.",
    ),
});

function extractReadableText(html: string): string {
  // Previously replaced every entity with a space, which turned "don&#39;t" into "don t" in the
  // text the persona analysis reads. Decoding properly keeps the founder's own words intact.
  return htmlToText(html).slice(0, 12000);
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Intentionally unauthenticated: onboarding runs before sign-in, so this
// route can't gate on a session yet.
export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  const target = normalizeUrl(url);
  let pageText = "";
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KylaniBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    pageText = extractReadableText(html);
  } catch {
    // Fall through with empty pageText — Claude reasons from the URL and web search alone.
  }

  try {
    const analysis = await getAnthropic().messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      system:
        "You are Kylani, a lead-gen assistant. Your job here is a three-part real search — isolate the PROBLEM, the " +
        "SOLUTION, and the AUDIENCE — not a guess from scraped marketing copy. Use the web_search tool for all three: " +
        "(1) Solution — verify what the company actually sells; the scraped page text can be thin, marketing-fluffed, " +
        "or missing, so confirm the real product against outside sources, not just a tagline. Also search 2-3 " +
        "competitors or comparable products in the same space to see who THEY sell to and how broadly they position " +
        "their market. " +
        "(2) Problem — search for how real people actually describe this pain: forum threads, subreddit posts, " +
        "review complaints, question-and-answer sites. Pull out the literal phrases and search queries they use, not " +
        "the vendor's marketing language for the same idea. " +
        "(3) Audience — use both of the above to name concrete buyers, sanity-checked against how competitors " +
        "segment their own market. Most real products sell to a wider range of company types/sizes (or consumer " +
        "types) than a single narrow reading of the homepage suggests — do not narrow the buyer definition further " +
        "than the evidence actually supports; default to the broader, more inclusive framing unless the evidence " +
        "explicitly points to one narrow niche. Be concrete and specific, not generic — prefer named job titles over " +
        "vague roles, just not artificially narrow ones. Order buyers most-likely-to-buy first, and give exactly the " +
        "top one the tag 'Most likely' (null for the rest). You're working under a tight time budget — run a handful " +
        "of targeted searches across all three parts (aim for 3-4, never more than 6), not an exhaustive " +
        "investigation. " +
        // Onboarding used to ask the founder to pick a product category up front and fed a canned
        // paragraph of guidance per category into this prompt. That was a guess made before Kylani had
        // read anything; with web_search available the model works the framing out from real evidence.
        "Decide for yourself whether the buyer is an individual consumer archetype or a job title at a " +
        "company, and search whichever public spaces that kind of buyer actually uses — take whichever " +
        "framing the evidence supports rather than defaulting to B2B. For a consumer product describe " +
        "personas as archetypes with a lifestyle or interest descriptor ('Busy parent', 'Vinyl " +
        "collector'); for a business product use named job titles with a company type and size. " +
        "Every field has a hard length limit in its description — " +
        "treat those as strict maximums, not suggestions. Write like sparse UI copy, not a report: short, punchy, no " +
        "run-on sentences.",
      messages: [
        {
          role: "user",
          content: [
            `Site: ${target}`,
            pageText
              ? `Page text (may be partial/truncated):\n${pageText}`
              : "The page could not be fetched — search the web for this URL/company before falling back to inferring from the URL alone.",
          ].join("\n\n"),
        },
      ],
      output_config: {
        effort: "low",
        format: zodOutputFormat(AnalysisSchema),
      },
    });

    if (!analysis.parsed_output) {
      return NextResponse.json({ error: "Analysis failed to parse." }, { status: 502 });
    }

    // Clamp the model-chosen window to something a search can actually act on: under a week finds
    // almost nothing in a slow niche, and beyond a year "current signal" stops meaning anything.
    const out = analysis.parsed_output;
    return NextResponse.json({
      ...out,
      nicheKey: out.nicheKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "general",
      relevanceWindowDays: Math.min(365, Math.max(30, Math.round(out.relevanceWindowDays))),
    });
  } catch (err) {
    const message = toUserError(
      "analyze-site",
      err,
      "Couldn't read that site right now. Try again in a bit — if it keeps happening, email deacon@kylani.app.",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

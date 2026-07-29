import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/anthropic";

// This route combines an external site fetch with a Claude call, which can
// exceed the platform's default serverless function timeout (10s on Vercel
// Hobby) — raise it explicitly so the request has room to actually finish.
export const maxDuration = 60;

const AnalysisSchema = z.object({
  whatYouSell: z.string().describe("Exactly one short sentence (under 20 words) describing the product, the way a founder would say it out loud."),
  problem: z.string().describe("Exactly one sentence (under 25 words) naming the specific problem this product removes for its buyer."),
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
        where: z.string().describe("Company type and size range only, under 8 words, e.g. 'Third-party logistics, 20–200 people'."),
      }),
    )
    .min(2)
    .max(4),
});

function extractReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutNoise
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 12000);
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Intentionally unauthenticated: onboarding runs before sign-in, so this
// route can't gate on a session yet.
export async function POST(req: NextRequest) {
  const { url, note } = await req.json();
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
    // Fall through with empty pageText — Claude reasons from the URL + note alone.
  }

  try {
    const analysis = await getAnthropic().messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system:
        "You are Kylani, a lead-gen assistant that reads a company's site and works out who buys their product. " +
        "Be concrete and specific, not generic. Prefer named job titles over vague roles. " +
        "Order buyers most-likely-to-buy first, and give exactly the top one the tag 'Most likely' (null for the rest). " +
        "Every field has a hard length limit in its description — treat those as strict maximums, not suggestions. " +
        "Write like sparse UI copy, not a report: short, punchy, no run-on sentences.",
      messages: [
        {
          role: "user",
          content: [
            `Site: ${target}`,
            note ? `Founder's notes: ${note}` : null,
            pageText
              ? `Page text (may be partial/truncated):\n${pageText}`
              : "The page could not be fetched — infer from the URL and any notes alone, and say so implicitly by keeping guesses conservative.",
          ]
            .filter(Boolean)
            .join("\n\n"),
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

    return NextResponse.json(analysis.parsed_output);
  } catch (err) {
    // Surface the real cause (e.g. a missing ANTHROPIC_API_KEY) instead of letting an uncaught
    // exception fall through as an opaque non-JSON 500 the client can't read a message from.
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import { htmlToText } from "../htmlText";

// Tier 1 of inference. Target ~2s, hard ceiling 5s.
//
// The old flow put a single 25-45s analysis on the critical path before anything appeared on
// screen: opus, adaptive thinking, up to six web searches. That call is genuinely better, and it
// still runs — but it runs BEHIND the first results instead of in front of them.
//
// This one exists to answer one question fast: what words would someone with this problem use?
// That is all pass 1 needs to query the corpus. Sonnet, no thinking, no tools, no competitor
// research, small output. Everything that makes the deep pass slow is deliberately absent.

const FastSchema = z.object({
  whatYouSell: z.string().describe("One short sentence (under 20 words), the way a founder would say it out loud."),
  keywords: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe(
      "2-4 word phrases a SUFFERER would type — symptoms and complaints, never marketing language and never the product's own category name.",
    ),
  nicheKey: z
    .string()
    .describe(
      "Lowercase kebab-case slug naming the BUYER+PROBLEM niche, not the company. Two companies selling to the same buyer about the same problem must produce the same slug.",
    ),
});

export type FastAnalysis = z.infer<typeof FastSchema> & { ms: number };

const SYSTEM = [
  "You read a product page and answer in one shot, fast. No research, no deliberation.",
  "",
  "The keywords matter more than anything else here: they are used verbatim to search forums for",
  "people describing this problem. Those people do not know this product exists and would never use",
  "its marketing vocabulary — they describe symptoms. Write what THEY would type, not what the",
  "company would.",
  "",
  "Good: 'spreadsheet keeps breaking', 'trucks stacking up at receiving'.",
  "Bad: 'dock scheduling platform', 'workflow automation solution'.",
].join("\n");

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Fetches the page, cheaply. A failure here is not fatal — the model can still work from the URL
 * alone, and a 3s cap matters more than complete page text when the whole budget is ~5s.
 */
export async function fetchPageText(url: string, timeoutMs = 3000): Promise<string> {
  try {
    const res = await fetch(normalizeUrl(url), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KylaniBot/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return htmlToText(await res.text()).slice(0, 6000);
  } catch {
    return "";
  }
}

/**
 * Fast inference. `input` is either a URL's page text or, on the "no site yet" path, the one
 * sentence the founder typed — both are just context for the same call.
 */
export async function fastAnalyze(opts: {
  url?: string;
  sentence?: string;
  pageText?: string;
  timeoutMs?: number;
}): Promise<FastAnalysis> {
  const { url, sentence, pageText, timeoutMs = 5000 } = opts;
  const t0 = Date.now();

  const content = [
    url ? `Site: ${normalizeUrl(url)}` : null,
    sentence ? `The founder describes it as: ${sentence}` : null,
    pageText ? `Page text:\n${pageText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await getAnthropic().messages.parse(
    {
      model: "claude-sonnet-5",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: content || `Site: ${url ?? "unknown"}` }],
      output_config: { effort: "low", format: zodOutputFormat(FastSchema) },
    },
    { timeout: timeoutMs },
  );

  const parsed = result.parsed_output;
  if (!parsed) throw new Error("Fast analysis returned nothing.");

  return {
    ...parsed,
    nicheKey: parsed.nicheKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "general",
    ms: Date.now() - t0,
  };
}

/**
 * A last-resort analysis with no model call at all, derived from the domain name.
 *
 * Exists because the first screen must never be a dead end. If the model is down or over budget,
 * a search seeded from the domain is a poor search — but it is a search, and pass 2 plus the deep
 * analysis will correct it within seconds.
 */
export function analysisFromUrlAlone(url: string): FastAnalysis {
  const host = url.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
  const stem = host.split(".")[0] || host;
  const words = stem.replace(/[-_]+/g, " ").trim();
  return {
    whatYouSell: `Whatever ${host} sells — still working that out.`,
    keywords: [words, `${words} alternative`, `${words} problem`].filter((k) => k.trim().length > 2),
    nicheKey: stem.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "general",
    ms: 0,
  };
}

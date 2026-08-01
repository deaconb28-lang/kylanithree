import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";

// Open-web discovery, used to find the niche forums and communities that don't exist on Reddit.
//
// On provider choice, because the landscape moved and the obvious answers are gone:
//   • Google Custom Search JSON API — CLOSED to new customers; existing users must migrate by
//     2027-01-01. Not an option for a new project.
//   • Bing Web Search API — fully retired 2025-08-11.
//   • Brave Search API — dropped its free tier in Feb 2026; now metered, card required.
//   • Anthropic web_search — already paid for via ANTHROPIC_API_KEY, no new vendor.
//
// So Anthropic is the default and needs no extra setup. Brave is supported because it is markedly
// faster (a direct HTTP call rather than a model turn) and worth having if this ever moves onto a
// hot path — but discovery is cached per niche for 30 days, so the slower default costs one call
// per new niche, not one per search.

export type WebResult = { title: string; url: string; snippet: string };

export function webSearchProvider(): "brave" | "anthropic" | "none" {
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

async function braveSearch(query: string, limit: number, timeoutMs: number): Promise<WebResult[]> {
  const qs = new URLSearchParams({ q: query, count: String(Math.min(limit, 20)) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${qs}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY as string,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const json = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  return (json.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? "", url: r.url as string, snippet: r.description ?? "" }));
}

const ForumsSchema = z.object({
  forums: z.array(
    z.object({
      name: z.string().describe("The community's real name as it appears on the site."),
      url: z.string().describe("The real homepage URL of the community, exactly as found. Never invented."),
      why: z.string().describe("HARD LIMIT one sentence under 20 words: why this buyer congregates here."),
    }),
  ),
});

// Asks Claude to actually search the open web for communities. Returns only what it found, and the
// caller independently verifies each URL responds before it is treated as a venue — so a
// hallucinated domain cannot reach the founder.
async function anthropicForumSearch(niche: string, buyer: string, timeoutMs: number): Promise<WebResult[]> {
  const result = await getAnthropic().messages.parse(
    {
      model: "claude-sonnet-5",
      max_tokens: 2000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      system:
        "Use web_search to find REAL online communities — independent forums, Discourse instances, message boards, " +
        "Q&A sites, and niche community sites — where the given buyer discusses the given problem. " +
        "Exclude Reddit, Hacker News, Facebook, and LinkedIn: those are covered elsewhere. Prefer smaller, " +
        "focused communities over large general ones. Return only communities you actually found in search results, " +
        "with their real URLs copied exactly — never guess a domain, and never invent a community that would be a " +
        "good fit but that you did not see.",
      messages: [
        {
          role: "user",
          content: `Niche: ${niche}\nBuyer: ${buyer}\n\nFind up to 6 real communities where this buyer talks about this problem.`,
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(ForumsSchema) },
    },
    { timeout: timeoutMs },
  );

  return (result.parsed_output?.forums ?? []).map((f) => ({ title: f.name, url: f.url, snippet: f.why }));
}

const UrlsSchema = z.object({
  urls: z.array(z.string().describe("A real URL copied exactly from a search result. Never guessed, never constructed.")),
});

// Returns raw URLs for a shaped query. Deliberately returns URLs ONLY: callers fetch and parse the
// page themselves, so a model can suggest where to look but never supplies the content that ends
// up in front of a founder. Used by the Quora source, which has no API to call instead.
export async function findUrlsOnWeb(opts: {
  query: string;
  instruction: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<string[]> {
  const { query, instruction, limit = 8, timeoutMs = 8000 } = opts;
  const provider = webSearchProvider();
  if (provider === "none") return [];

  if (provider === "brave") {
    try {
      const results = await braveSearch(query, limit, Math.min(timeoutMs, 5000));
      return results.map((r) => r.url);
    } catch {
      return [];
    }
  }

  try {
    const result = await getAnthropic().messages.parse(
      {
        model: "claude-sonnet-5",
        max_tokens: 1200,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
        system: `${instruction} Return at most ${limit} URLs.`,
        messages: [{ role: "user", content: query }],
        output_config: { effort: "low", format: zodOutputFormat(UrlsSchema) },
      },
      { timeout: timeoutMs },
    );
    return (result.parsed_output?.urls ?? []).slice(0, limit);
  } catch {
    // A dead search provider degrades this source to nothing; it never fails the run.
    return [];
  }
}

export async function findCommunitiesOnWeb(opts: {
  niche: string;
  buyer: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<WebResult[]> {
  const { niche, buyer, limit = 10, timeoutMs = 15_000 } = opts;
  const provider = webSearchProvider();
  if (provider === "none") return [];
  if (provider === "brave") {
    // Two shaped queries beat one generic one for surfacing actual community sites.
    const queries = [`${niche} forum community -site:reddit.com`, `best online communities for ${buyer}`];
    const settled = await Promise.allSettled(queries.map((q) => braveSearch(q, limit, Math.min(timeoutMs, 5000))));
    const seen = new Map<string, WebResult>();
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const r of s.value) if (!seen.has(r.url)) seen.set(r.url, r);
    }
    return [...seen.values()];
  }
  return anthropicForumSearch(niche, buyer, timeoutMs);
}

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import { getDb } from "../mongodb";
import { searchSubreddits, type SubredditResult } from "./reddit";
import { settleWithBudget, type Trace } from "./trace";
import { formatMembers, sizeFit, termRelevance } from "./ranking";
import type { Venue } from "./types";

export { formatMembers, sizeFit } from "./ranking";

// Stage 1 — venue resolution. Subreddit discovery runs against Reddit's own search, so the
// subscriber counts driving the ranking are REAL numbers rather than a model's guess. That is what
// makes "prefer the focused 8k community over the 2M general one" an actual rule instead of an
// aspiration in a prompt.

const VENUE_TTL_DAYS = 30;

// Always in the candidate pool, and the reason a run still produces leads when Reddit is
// unavailable — HN needs no registered app, no key, and no approval. The annotation pass decides
// whether it is actually relevant to this buyer; for a consumer or lifestyle niche it will be
// dropped, which is correct.
const HACKER_NEWS: Venue = {
  id: "hn:all",
  platform: "Hacker News",
  name: "Hacker News",
  url: "https://news.ycombinator.com/",
  members: null,
  membersLabel: "size unknown",
  fit: "Untested",
  note: "Comment threads, not posts — answer someone's question rather than announcing anything.",
  searchable: true,
  rank: 0.5,
};

export interface VenueCacheDoc {
  nicheKey: string;
  venues: Venue[];
  createdAt: Date;
  expiresAt: Date;
}

async function VenueCache() {
  return (await getDb()).collection<VenueCacheDoc>("venueCache");
}

const AnnotationSchema = z.object({
  venues: z.array(
    z.object({
      slug: z.string().describe("The subreddit slug exactly as given, without the r/ prefix."),
      keep: z.boolean().describe("False if this community is off-topic for the buyer, or is a general/meme community where outreach would be inappropriate."),
      fit: z.enum(["Strong fit", "Weak", "Untested"]),
      note: z.string().describe("HARD LIMIT one sentence under 22 words: what real participation looks like here for this founder."),
    }),
  ),
});

// Discovery is deliberately cheap and parallel; the model is used only to prune and annotate what
// Reddit already confirmed exists. Nothing here asks a model to invent a community name.
export async function resolveVenues(opts: {
  nicheKey: string;
  buyers: { name: string; desc: string }[];
  whatYouSell: string;
  lexiconTerms: string[];
  trace: Trace;
  maxVenues?: number;
}): Promise<{ venues: Venue[]; cached: boolean }> {
  const { nicheKey, buyers, whatYouSell, lexiconTerms, trace, maxVenues = 8 } = opts;

  // Cache is keyed on the niche, not the user or the URL — two founders selling into the same
  // buyer share venue resolution, which is what makes a warm run effectively instant.
  try {
    const cache = await VenueCache();
    const hit = await cache.findOne({ nicheKey, expiresAt: { $gt: new Date() } });
    if (hit?.venues?.length) {
      trace.record({ stage: "venues:cache", candidatesIn: 0, candidatesOut: hit.venues.length, ms: 0, note: `hit ${nicheKey}` });
      return { venues: hit.venues, cached: true };
    }
  } catch (err) {
    trace.record({ stage: "venues:cache", candidatesIn: 0, candidatesOut: 0, ms: 0, note: `unavailable: ${err instanceof Error ? err.message : err}` });
  }

  const queries = [...new Set([...lexiconTerms.slice(0, 6), ...buyers.slice(0, 3).map((b) => b.name)])].filter(Boolean);

  const discovered = await trace.stage("venues:discover", queries.length, async () => {
    const { results, timeouts, errors } = await settleWithBudget(
      queries.map((q) => () => searchSubreddits(q, 4000)),
      4500,
    );
    const unique = new Map<string, SubredditResult>();
    for (const r of results) if (!r.nsfw) unique.set(r.slug.toLowerCase(), r);
    return {
      out: [...unique.values()],
      drops: { source_timeout: timeouts, source_error: errors },
    };
  });

  // Reddit discovery returning nothing (no credentials, a 403 from a datacenter IP, an outage) is
  // a degraded run, not a failed one — the auth-free sources still carry it.
  if (discovered.length === 0) {
    trace.record({ stage: "venues:reddit-unavailable", candidatesIn: 0, candidatesOut: 1, ms: 0, note: "falling back to auth-free venues only" });
    return { venues: [HACKER_NEWS], cached: false };
  }

  const ranked = discovered
    .map((s) => ({ sub: s, rank: termRelevance(`${s.name} ${s.description}`, lexiconTerms) * 0.6 + sizeFit(s.subscribers) * 0.4 }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, maxVenues * 2);

  const annotated = await trace.stage("venues:annotate", ranked.length, async () => {
    try {
      const result = await getAnthropic().messages.parse({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system:
          "You are Kylani. You are given real subreddits (confirmed to exist, with real subscriber counts) and a " +
          "product. Decide which are genuinely places this product's buyer discusses this problem, and write one " +
          "short note each on how to participate there. Drop general-interest, meme, or off-topic communities. " +
          "Prefer focused communities over huge general ones. Keep notes concrete and under the stated limit.",
        messages: [
          {
            role: "user",
            content: [
              `Product: ${whatYouSell}`,
              `Buyers: ${buyers.map((b) => `${b.name} — ${b.desc}`).join(" | ")}`,
              "",
              "Communities (slug — size — description):",
              ...ranked.map((r) => `- ${r.sub.slug} (${formatMembers(r.sub.subscribers)}): ${r.sub.description || "no description"}`),
              `- hn:all (Hacker News): founders, engineers, and technical operators. Keep ONLY if this buyer is plausibly technical or startup-adjacent; drop it for consumer, lifestyle, retail, or non-technical buyers.`,
            ].join("\n"),
          },
        ],
        output_config: { effort: "low", format: zodOutputFormat(AnnotationSchema) },
      });
      const verdicts = new Map((result.parsed_output?.venues ?? []).map((v) => [v.slug.toLowerCase(), v]));
      const out = ranked
        .filter((r) => verdicts.get(r.sub.slug.toLowerCase())?.keep !== false)
        .map((r) => {
          const v = verdicts.get(r.sub.slug.toLowerCase());
          return {
            id: `reddit:${r.sub.slug}`,
            platform: "Reddit" as const,
            name: r.sub.name,
            url: `https://www.reddit.com/r/${r.sub.slug}/`,
            members: r.sub.subscribers,
            membersLabel: formatMembers(r.sub.subscribers),
            fit: (v?.fit ?? "Untested") as Venue["fit"],
            note: v?.note || r.sub.description.slice(0, 120) || "Worth testing — no description available.",
            searchable: true,
            rank: r.rank,
          };
        })
        .slice(0, maxVenues);
      const hnVerdict = verdicts.get("hn:all");
      return { out: hnVerdict?.keep === false ? out : [...out, { ...HACKER_NEWS, fit: hnVerdict?.fit ?? HACKER_NEWS.fit, note: hnVerdict?.note || HACKER_NEWS.note }] };
    } catch {
      // Annotation is a nice-to-have. If the model call fails the venues are still real and still
      // searchable, so the run continues with unannotated entries rather than collapsing.
      const out = ranked.slice(0, maxVenues).map((r) => ({
        id: `reddit:${r.sub.slug}`,
        platform: "Reddit" as const,
        name: r.sub.name,
        url: `https://www.reddit.com/r/${r.sub.slug}/`,
        members: r.sub.subscribers,
        membersLabel: formatMembers(r.sub.subscribers),
        fit: "Untested" as const,
        note: r.sub.description.slice(0, 120) || "Worth testing — no description available.",
        searchable: true,
        rank: r.rank,
      }));
      return { out, note: "annotation failed, using unannotated venues" };
    }
  });

  try {
    const cache = await VenueCache();
    const now = new Date();
    await cache.updateOne(
      { nicheKey },
      { $set: { nicheKey, venues: annotated, createdAt: now, expiresAt: new Date(now.getTime() + VENUE_TTL_DAYS * 86_400_000) } },
      { upsert: true },
    );
  } catch {
    // A cache write failure must never fail the run — worst case the next founder in this niche
    // pays the cold cost again.
  }

  return { venues: annotated, cached: false };
}

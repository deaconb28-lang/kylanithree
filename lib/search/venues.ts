import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "../anthropic";
import { getDb } from "../mongodb";
import { searchSubreddits, type SubredditResult } from "./reddit";
import { hasXCredentials } from "./x";
import { hasBlueskyCredentials } from "./bluesky";
import { findCommunitiesOnWeb, webSearchProvider } from "./websearch";
import { isDiscourse } from "./discourse";
import { pickStackExchangeSites } from "./seSites";
import { settleWithBudget, type Trace } from "./trace";
import { formatMembers, sizeFit, termRelevance } from "./ranking";
import type { Venue } from "./types";

export { formatMembers, sizeFit } from "./ranking";

// Stage 1 — venue resolution. Subreddit discovery runs against Reddit's own search, so the
// subscriber counts driving the ranking are REAL numbers rather than a model's guess. That is what
// makes "prefer the focused 8k community over the 2M general one" an actual rule instead of an
// aspiration in a prompt.

const VENUE_TTL_DAYS = 30;

// Short hints so the annotation pass can judge the credential-free sources on the same footing as
// the discovered subreddits, instead of them being kept or dropped by default.
const VENUE_HINTS: Record<string, string> = {
  "bsky:all": "public short posts, open to everyone and growing. Reasonable for most buyers who complain publicly.",
  "hn:all": "founders, engineers, and technical operators. Keep only if this buyer is plausibly technical or startup-adjacent; drop for consumer, lifestyle, or retail buyers.",
  "lemmy:all": "federated general-interest communities, Reddit-like in tone and topic spread. Reasonable for most buyers.",
  "x:all": "short public posts across every topic. Keep if this buyer complains publicly; drop for private or enterprise-only buyers.",
};

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

const LEMMY: Venue = {
  id: "lemmy:all",
  platform: "Forum",
  name: "Lemmy communities",
  url: "https://lemmy.world/",
  members: null,
  membersLabel: "size unknown",
  fit: "Untested",
  note: "Federated, Reddit-shaped communities. Smaller but far less hostile to a genuine reply.",
  searchable: true,
  rank: 0.45,
};

const BLUESKY: Venue = {
  id: "bsky:all",
  platform: "X",
  name: "Bluesky",
  url: "https://bsky.app/",
  members: null,
  membersLabel: "size unknown",
  fit: "Untested",
  note: "Public short posts, fully open API. Reply in thread — never a cold DM.",
  searchable: true,
  rank: 0.55,
};

const X_VENUE: Venue = {
  id: "x:all",
  platform: "X",
  name: "X",
  url: "https://x.com/",
  members: null,
  membersLabel: "size unknown",
  fit: "Untested",
  note: "Reply in the thread, never a cold DM. Recent posts only — the API covers about a week.",
  searchable: true,
  rank: 0.4,
};

// Sources that need no per-niche discovery. HN and Lemmy are unconditional because they require no
// credentials at all; X joins them only when a token exists, since it has no free search tier.
function alwaysAvailableVenues(lexiconTerms: string[] = []): Venue[] {
  const seSites = pickStackExchangeSites(lexiconTerms);
  const seVenues: Venue[] = seSites.map((site) => ({
    id: `stackexchange:${site}`,
    platform: "Forum",
    name: `${site}.stackexchange.com`,
    url: `https://${site}.stackexchange.com/`,
    members: null,
    membersLabel: "size unknown",
    fit: "Untested",
    // Every item is a question, which is about as explicit as "actively looking" gets.
    note: "Answer the question properly first; mention the product only if it genuinely fits.",
    searchable: true,
    rank: 0.6,
  }));
  return [HACKER_NEWS, LEMMY, ...(hasBlueskyCredentials() ? [BLUESKY] : []), ...seVenues, ...(hasXCredentials() ? [X_VENUE] : [])];
}

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
    const webOnly = await discoverWebForums({ nicheKey, buyers, trace });
    const fallback = [...webOnly, ...alwaysAvailableVenues(lexiconTerms)];
    trace.record({
      stage: "venues:reddit-unavailable",
      candidatesIn: 0,
      candidatesOut: fallback.length,
      ms: 0,
      note: "Reddit returned nothing (no credentials, blocked IP, or outage) — continuing on auth-free sources",
    });
    return { venues: fallback, cached: false };
  }

  // Kicked off here but awaited after annotation, so the open-web search overlaps the annotation
  // model call rather than adding its latency on top of it.
  const webVenuesPromise = discoverWebForums({ nicheKey, buyers, trace });

  const ranked = discovered
    .map((s) => ({ sub: s, rank: termRelevance(`${s.name} ${s.description}`, lexiconTerms) * 0.6 + sizeFit(s.subscribers) * 0.4 }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, maxVenues * 2);

  const annotated = await trace.stage("venues:annotate", ranked.length, async () => {
    const webVenues = await webVenuesPromise;
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
              ...alwaysAvailableVenues(lexiconTerms).map((v) => `- ${v.id} (${v.name}): ${VENUE_HINTS[v.id] ?? "topical Q&A — every item is someone explicitly asking for help"}`),
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
      const extras = alwaysAvailableVenues(lexiconTerms)
        .filter((v) => verdicts.get(v.id)?.keep !== false)
        .map((v) => {
          const verdict = verdicts.get(v.id);
          return { ...v, fit: verdict?.fit ?? v.fit, note: verdict?.note || v.note };
        });
      const merged = [...out, ...webVenues, ...extras];
      // A run with no searchable venue produces no leads by construction. If annotation pruned
      // everything, keep the highest-ranked communities anyway — a weak venue that gets searched
      // beats a perfect one that does not exist.
      if (!merged.some((v) => v.searchable)) {
        return { out: [...merged, ...alwaysAvailableVenues(lexiconTerms)], note: "annotation left nothing searchable; restored defaults" };
      }
      return { out: merged };
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
      return { out: [...out, ...webVenues, ...alwaysAvailableVenues(lexiconTerms)], note: "annotation failed, using unannotated venues" };
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

// Open-web discovery. Every URL a model returns is independently probed before it is treated as a
// searchable venue, so a hallucinated domain can never reach the founder: a site that really is a
// Discourse instance becomes a lead source, anything else is surfaced as a place worth joining but
// explicitly marked unsearchable.
async function discoverWebForums(opts: {
  nicheKey: string;
  buyers: { name: string; desc: string }[];
  trace: Trace;
}): Promise<Venue[]> {
  const { nicheKey, buyers, trace } = opts;
  if (webSearchProvider() === "none") return [];

  return trace.stage("venues:web", 1, async () => {
    let found;
    try {
      found = await findCommunitiesOnWeb({
        niche: nicheKey.replace(/-/g, " "),
        buyer: `${buyers[0]?.name ?? "buyer"} — ${buyers[0]?.desc ?? ""}`,
      });
    } catch (err) {
      return { out: [] as Venue[], note: `web discovery failed: ${err instanceof Error ? err.message : err}` };
    }
    if (found.length === 0) return { out: [] as Venue[], note: "no independent communities found" };

    const probed = await Promise.allSettled(
      found.slice(0, 6).map(async (r) => ({ result: r, discourse: await isDiscourse(r.url) })),
    );

    const out: Venue[] = [];
    for (const p of probed) {
      if (p.status !== "fulfilled") continue;
      const { result, discourse } = p.value;
      let host: string;
      try {
        host = new URL(result.url.startsWith("http") ? result.url : `https://${result.url}`).host;
      } catch {
        continue;
      }
      out.push({
        id: discourse ? `discourse:${host}` : `web:${host}`,
        platform: "Forum",
        name: result.title || host,
        url: result.url,
        members: null,
        membersLabel: "size unknown",
        fit: "Untested",
        note: discourse
          ? result.snippet || "Independent forum — reply in existing threads."
          : `${result.snippet || "Independent community."} Not machine-readable, so worth joining by hand.`,
        searchable: discourse,
        rank: discourse ? 0.7 : 0.3,
      });
    }
    return { out, note: `${out.filter((v) => v.searchable).length} of ${out.length} are searchable` };
  });
}

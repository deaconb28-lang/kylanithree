import { collapseWhitespace, decodeHtmlEntities, stripTags } from "../htmlText";
import type { Candidate } from "./types";

// Lemmy — federated, Reddit-shaped, and completely open: no app registration, no key, no approval.
// That makes it the closest auth-free substitute for Reddit's general-interest communities, which
// matters because Reddit is the single source most likely to be unavailable.
//
// Queried across a couple of large instances; federation means each one indexes content from many
// others, so a single instance already reaches well beyond its own users.
const INSTANCES = ["https://lemmy.world", "https://lemmy.ml"];

type LemmyPost = {
  post?: { id?: number; name?: string; body?: string | null; published?: string; ap_id?: string };
  creator?: { name?: string };
  counts?: { score?: number; comments?: number };
  community?: { name?: string };
};

export async function searchLemmy(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<Candidate[]> {
  const { query, limit = 20, timeoutMs = 4000 } = opts;

  const perInstance = await Promise.allSettled(
    INSTANCES.map(async (base) => {
      const qs = new URLSearchParams({ q: query, type_: "Posts", sort: "New", limit: String(limit) });
      const res = await fetch(`${base}/api/v3/search?${qs}`, {
        headers: { "User-Agent": process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Lemmy ${base} failed: ${res.status}`);
      const json = (await res.json()) as { posts?: LemmyPost[] };
      return json.posts ?? [];
    }),
  );

  const out = new Map<string, Candidate>();
  for (const settled of perInstance) {
    if (settled.status !== "fulfilled") continue;
    for (const p of settled.value) {
      const post = p.post;
      const author = p.creator?.name;
      if (!post?.id || !author || !post.published) continue;
      const permalink = post.ap_id || `${INSTANCES[0]}/post/${post.id}`;
      // Federation means the same post surfaces from several instances — key on its canonical
      // ActivityPub id so it counts once.
      if (out.has(permalink)) continue;
      const body = collapseWhitespace(decodeHtmlEntities(stripTags(post.body ?? "")));
      const title = collapseWhitespace(decodeHtmlEntities(post.name ?? ""));
      out.set(permalink, {
        id: `lemmy:${post.id}`,
        venueId: "lemmy:all",
        venueName: p.community?.name ? `!${p.community.name} · Lemmy` : "Lemmy",
        platform: "Forum",
        author,
        permalink,
        postedAt: new Date(post.published),
        title,
        body: (body || title).slice(0, 4000),
        score: p.counts?.score ?? 0,
        numComments: p.counts?.comments ?? 0,
      });
    }
  }
  return [...out.values()];
}

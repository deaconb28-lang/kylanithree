import { htmlToText } from "../htmlText";
import { findUrlsOnWeb } from "./websearch";
import type { Candidate } from "./types";

// Quora, which is worth having for the same reason Stack Exchange is: every item is someone
// explicitly asking a question, which is about as close to "actively looking for a solution" as a
// public post gets. It skews consumer and professional-advice rather than technical, so it reaches
// buyers the developer-shaped sources never will.
//
// Quora has NO public API and blocks scrapers hard, so this works differently from every other
// source here — and the difference matters enough to spell out:
//
//   1. Web search finds candidate quora.com question URLs. A model is involved at this step, so
//      those URLs are untrusted.
//   2. Every URL is then FETCHED and parsed. Title, question text and author come out of the real
//      page, never out of the model.
//   3. A URL that doesn't resolve, isn't on quora.com, or yields no readable question text is
//      dropped.
//
// So the model can suggest where to look but cannot invent what was said — which keeps the same
// guarantee the API-backed sources get structurally. Quora frequently blocks datacenter IPs
// outright; when it does, this source returns nothing rather than degrading into model output.

const QUESTION_RE = /^https?:\/\/(?:[a-z-]+\.)?quora\.com\/[^/?#]+/i;

function isQuoraQuestionUrl(url: string): boolean {
  if (!QUESTION_RE.test(url)) return false;
  // Profiles, topics and spaces are not questions and have no asker to quote.
  return !/quora\.com\/(profile|topic|q|unanswered)\//i.test(url);
}

// Quora renders the question into <title> and seeds the answer body into the page. This pulls the
// question itself, which is the part someone actually wrote.
function parseQuestion(html: string): { title: string; body: string; author: string | null; postedAt: Date | null } | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? htmlToText(titleMatch[1]).replace(/\s*[-|]\s*Quora\s*$/i, "").trim() : "";
  if (!rawTitle || rawTitle.length < 12) return null;

  // Quora embeds JSON-LD on question pages; when present it carries the real asker and date.
  let author: string | null = null;
  let postedAt: Date | null = null;
  let body = "";
  const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    try {
      const parsed = JSON.parse(ld[1]) as {
        mainEntity?: { text?: string; author?: { name?: string }; dateCreated?: string; upvoteCount?: number };
      };
      const q = parsed.mainEntity;
      if (q?.author?.name) author = q.author.name;
      if (q?.dateCreated) {
        const d = new Date(q.dateCreated);
        if (!Number.isNaN(d.getTime())) postedAt = d;
      }
      if (q?.text) body = htmlToText(q.text);
    } catch {
      // Malformed JSON-LD — fall through to the title-only path below.
    }
  }

  // A Quora question title IS the question, so a page with no extra body text is still a usable
  // candidate. Anything shorter than the cheap filter's floor gets dropped downstream anyway.
  if (!body) body = rawTitle;
  return { title: rawTitle, body: body.slice(0, 4000), author, postedAt };
}

export async function searchQuora(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
  page?: number;
}): Promise<Candidate[]> {
  const { query, windowDays, limit = 8, timeoutMs = 4000 } = opts;

  const urls = (
    await findUrlsOnWeb({
      query: `${query} site:quora.com`,
      instruction:
        "Find real Quora QUESTION pages where someone is asking about this. Return only quora.com question URLs you " +
        "actually saw in search results, copied exactly. Never guess a URL slug, and skip profile, topic and space pages.",
      limit,
      timeoutMs,
    })
  ).filter(isQuoraQuestionUrl);

  if (urls.length === 0) return [];

  const cutoff = Date.now() - windowDays * 86_400_000;

  const settled = await Promise.allSettled(
    urls.slice(0, limit).map(async (url) => {
      const res = await fetch(url, {
        headers: {
          // Quora serves a JS shell to unknown agents; a browser UA gets the server-rendered page.
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Quora ${res.status}`);
      const parsed = parseQuestion(await res.text());
      if (!parsed) throw new Error("Quora page had no readable question");
      return { url, parsed };
    }),
  );

  const out: Candidate[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const { url, parsed } = s.value;
    // No date on the page means we cannot honour the relevance window, and a lead without a
    // timestamp is not a lead by our own definition — so it is dropped rather than guessed at.
    if (!parsed.postedAt || parsed.postedAt.getTime() < cutoff) continue;
    if (!parsed.author) continue;
    out.push({
      id: `quora:${url}`,
      venueId: "quora:all",
      venueName: "Quora",
      platform: "Forum",
      networkId: "quora",
      author: parsed.author,
      permalink: url,
      postedAt: parsed.postedAt,
      title: parsed.title,
      body: parsed.body,
      score: 0,
      numComments: 0,
    });
  }
  return out;
}

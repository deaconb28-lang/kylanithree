import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Site icons for the places leads were found, served from our own origin.
//
// The obvious implementation is `https://www.google.com/s2/favicons?domain=…` or DuckDuckGo's
// equivalent, one line and no route file. Both send a third party the host of every lead a founder
// is looking at, one request per card — which is a list of who this product is finding for them,
// handed to someone else, in exchange for a 16px picture. Not worth it.
//
// The second obvious implementation is `https://<host>/favicon.ico` straight from an <img>. That was
// measured before it was written and it does not work for the platforms this product actually
// crawls: of seven representative hosts only Hacker News served a root favicon.ico. Lemmy, Bluesky
// and Discourse all 404 it and declare their icon in the document head instead, so a naive version
// would have shown a real icon for HN and a broken one for most other leads.
//
// So: fetch the page, read its declared icon, fetch that, and cache hard. A founder's fourteen leads
// come from a handful of hosts, so this is a few requests once and CDN hits thereafter.

import { isPublicHost, stackExchangeIcon } from "@/lib/favicon";

const CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";

function absolute(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin);
    // http(s) only — a data: or javascript: href in a page we do not control must not be followed.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The icon a page declares, best first.
 *
 * Ordered by size preference rather than document order: `apple-touch-icon` is typically 180px and
 * renders cleanly at any avatar size, while a 16px `.ico` upscaled to 30px is mush. A page usually
 * declares several and picking the first would take whichever the author happened to list.
 */
function declaredIcons(html: string, origin: string): string[] {
  const found: { href: string; rank: number }[] = [];
  const linkTag = /<link\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkTag.exec(html))) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag[0])?.[1]?.toLowerCase() ?? "";
    if (!/\b(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)\b/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(tag[0])?.[1];
    if (!href) continue;
    const abs = absolute(href.trim(), origin);
    if (!abs) continue;

    const sizes = /\bsizes\s*=\s*["']?(\d+)/i.exec(tag[0])?.[1];
    const px = sizes ? Number(sizes) : rel.includes("apple-touch") ? 180 : 0;
    // Prefer something between 32 and 256: big enough to be sharp, not a 512px PNG per card.
    const rank = px >= 32 && px <= 256 ? 1000 - Math.abs(px - 64) : px > 256 ? 300 : px === 0 ? 200 : 100;
    found.push({ href: abs, rank });
  }
  return found.sort((a, b) => b.rank - a.rank).map((f) => f.href);
}

/**
 * Lemmy instances declare their icon through the same open API the crawler already reads.
 *
 * `/api/v3/post/list` is open on these hosts (that is why Lemmy is the Reddit substitute at all), and
 * `/api/v3/site` is open for the same reason — so the instance will tell us its icon even when it
 * will not serve us its homepage. Tried only after the cheaper paths, since a non-Lemmy host just
 * fails here.
 */
async function lemmyIcon(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/api/v3/site`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json", "User-Agent": "Kylani/1.0 (+https://www.kylani.app)" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { site_view?: { site?: { icon?: string } } };
    const icon = body?.site_view?.site?.icon;
    return typeof icon === "string" && icon ? absolute(icon, origin) : null;
  } catch {
    return null;
  }
}

async function fetchIcon(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kylani/1.0; +https://www.kylani.app)", Accept: "image/*" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // A site that answers a missing icon with its 200 HTML error page would otherwise be rendered
    // as an <img> pointing at a document.
    if (!type.startsWith("image/")) return null;
    return res;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("host") ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!isPublicHost(host)) {
    return NextResponse.json({ error: "Bad host." }, { status: 400 });
  }

  const origin = `https://${host}`;
  const candidates: string[] = [];

  // Cheapest and most exact first: if this is a Stack Exchange site we know where its icon lives
  // and can skip the homepage entirely — which is just as well, because that homepage 403s us.
  const seIcon = stackExchangeIcon(host);
  if (seIcon) candidates.push(seIcon);

  try {
    const page = await fetch(origin, {
      signal: AbortSignal.timeout(6000),
      headers: {
        // Some of these hosts refuse a bare fetch from a datacenter without a browser-shaped UA —
        // the same edge behaviour Reddit applies. This is a public homepage, requested once per
        // host per day, not an attempt to look like a person.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (page.ok) {
      // Only the head is needed and some of these pages are large, so the body is capped rather
      // than read whole.
      const html = (await page.text()).slice(0, 120_000);
      candidates.push(...declaredIcons(html, page.url || origin));
    }
  } catch {
    // Unreachable homepage is not fatal — the root .ico below still works for some hosts.
  }

  // Nothing declared and nothing known — ask the Lemmy API, which is open on these instances even
  // when their homepage is not. Skipped entirely when the page already told us where its icon is.
  if (candidates.length === 0) {
    const lemmy = await lemmyIcon(origin);
    if (lemmy) candidates.push(lemmy);
  }

  // Last resort, and the reason it is last: it is exactly the guess that fails on most of the
  // platforms this product crawls.
  candidates.push(`${origin}/favicon.ico`);

  for (const candidate of candidates.slice(0, 4)) {
    const icon = await fetchIcon(candidate);
    if (!icon) continue;
    const body = await icon.arrayBuffer();
    // 200KB is generous for an icon and small enough that a mislabelled asset cannot be used to
    // push weight through this route.
    if (body.byteLength === 0 || body.byteLength > 200_000) continue;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": icon.headers.get("content-type") ?? "image/x-icon",
        "Cache-Control": CACHE,
        // The bytes come from a third-party host; nothing here should ever be treated as script.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 404 rather than a placeholder image: the caller falls back to initials, and an <img> that
  // silently resolves to a grey square looks identical to a site whose icon simply did not load.
  // Cached too, so a host with no icon is not re-fetched on every card.
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": CACHE } });
}

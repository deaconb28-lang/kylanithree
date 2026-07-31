import { NextRequest, NextResponse } from "next/server";
import { cleanSiteDescription, cleanSiteTitle } from "@/lib/htmlText";

// Deliberately model-free and fast. Its only job is to put the founder's own site — icon, name,
// and a real one-line description — on screen within a second of them hitting "Read my product",
// while the much slower analyze-site call is still running. Grounding the wait in something
// recognisably theirs is the point; a spinner alone reads as "nothing is happening".
export const maxDuration = 10;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  const target = normalizeUrl(url);
  let host = "";
  try {
    host = new URL(target).hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  // The icon comes from a resolver service rather than parsing <link rel="icon"> ourselves:
  // sites declare icons in a dozen inconsistent ways (relative paths, data URIs, SVG, manifest
  // entries, none at all) and the resolver already handles every one of them plus a fallback.
  const iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KylaniBot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    const html = (await res.text()).slice(0, 60_000);

    const rawTitle =
      metaContent(html, [
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
        /<title[^>]*>([^<]+)<\/title>/i,
      ]) ?? host;

    const rawDescription = metaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ]);

    const title = cleanSiteTitle(rawTitle, host);
    return NextResponse.json({
      host,
      iconUrl,
      title,
      description: cleanSiteDescription(rawDescription, title),
    });
  } catch {
    // A site that blocks bots or times out still has a host and an icon — return what's true
    // rather than failing the preview and leaving the screen blank.
    return NextResponse.json({ host, iconUrl, title: host, description: null });
  }
}

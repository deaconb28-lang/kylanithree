// Host validation for /api/favicon, kept out of the route so it can be tested.
//
// This route fetches whatever host it is handed, which makes it an SSRF surface. The rule below is
// the whole guard, so it is pinned by tests rather than reviewed by eye — a regression here is not a
// broken picture, it is a request to somewhere internal made on our behalf.

/**
 * Only public, plausible hostnames.
 *
 * THE ORDER IS THE POINT. A textual "does this look like an IP" test is not enough, because the URL
 * parser rewrites the host before anything is dialled: `0x7f.1`, `0177.0.0.1` and `2130706433` all
 * normalise to 127.0.0.1, and the first two walk straight past `/^[0-9.]+$/` because they contain
 * letters or leading zeroes. That was measured against a running build, not assumed — an earlier
 * version of this function returned true for `0x7f.1`.
 *
 * So the host is normalised FIRST and judged afterwards, on the value that will actually be
 * requested rather than on the string somebody typed.
 *
 * IP literals are rejected outright rather than by enumerating private ranges. No lead source is
 * addressed by IP, so one rule excludes the cloud metadata endpoint, loopback and every RFC1918
 * address at once — and cannot be arithmetic-ed around the way a range list can.
 */
export function isPublicHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  if (!host.includes(".")) return false;
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return false;

  let normalized: string;
  try {
    normalized = new URL(`https://${host}/`).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Anything the parser rewrote is not the host that was asked for. Refusing the mismatch is
  // simpler, and safer, than trying to decide which rewrites are benign.
  if (normalized !== host) return false;
  if (/^[0-9.]+$/.test(normalized) || normalized.startsWith("[")) return false;
  if (!normalized.includes(".")) return false;
  if (/(^|\.)(localhost|local|internal|intranet|home|lan)$/i.test(normalized)) return false;
  return true;
}

/** The bare host a lead came from, or null when there is no honest answer. */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * Stack Exchange publishes every site's icon at a predictable CDN path.
 *
 * Worth special-casing because it is 166 of the source registry and because their homepages 403 a
 * datacenter fetch — the generic "read the page's <link rel=icon>" path cannot work there at all.
 * `cdn.sstatic.net` answers normally, so this also saves a request.
 */
export function stackExchangeIcon(host: string): string | null {
  const slug =
    /^([a-z0-9-]+)\.stackexchange\.com$/.exec(host)?.[1] ??
    // The handful of Stack Exchange sites on their own domains rather than a subdomain.
    (/^(stackoverflow|superuser|serverfault|askubuntu|mathoverflow|stackapps)\.(com|net)$/.exec(host)?.[1] ?? null);
  return slug ? `https://cdn.sstatic.net/Sites/${slug}/Img/apple-touch-icon.png` : null;
}

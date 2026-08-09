// HTML → readable text. Pure and dependency-free so it can be unit-tested directly.
//
// This exists because three separate places were each doing their own partial job of it: the site
// preview left `&#039;` visible in the UI, the Hacker News reader only knew a handful of named
// entities, and the site scraper replaced every entity with a SPACE — which silently destroyed
// apostrophes in the text the buyer-persona analysis reads. Post bodies matter doubly: a mangled
// body breaks the verbatim-excerpt check downstream, so a lead can be lost to a stray entity.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  laquo: "«", raquo: "»", prime: "′", deg: "°", plusmn: "±", times: "×", divide: "÷",
  frac12: "½", frac14: "¼", frac34: "¾", ne: "≠", le: "≤", ge: "≥", minus: "−",
  trade: "™", reg: "®", copy: "©", sect: "§", para: "¶", dagger: "†", permil: "‰",
  euro: "€", pound: "£", yen: "¥", cent: "¢", iexcl: "¡", iquest: "¿",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç",
  uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", ntilde: "ñ", oslash: "ø", aring: "å",
  shy: "", zwj: "", zwnj: "", lrm: "", rlm: "", thinsp: " ", ensp: " ", emsp: " ",
};

// Handles decimal (&#39; and the zero-padded &#039;), hex (&#x27;), and the named set above.
// Numeric coverage is the important half — most encoders emit numeric entities, which is exactly
// what a hand-written named-only map misses.
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]{1,10});/gi, (match, name: string) => {
      const hit = NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()];
      return hit === undefined ? match : hit;
    });
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

// ™ ® © ℠ and the superscript variants. Legally meaningful on the owner's own site, visual noise
// in a UI badge that is simply naming which site is being read.
export function stripTrademarkMarks(s: string): string {
  return s.replace(/[™®©℠]/g, "");
}

export function collapseWhitespace(s: string): string {
  return s.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// Full pipeline for arbitrary HTML → plain readable text.
export function htmlToText(html: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripTags(html)));
}

// Cuts at a word boundary rather than mid-word. A hard slice produced things like
// "…recipes that don't take all da" in the UI.
export function truncateAtWord(s: string, max: number): string {
  const clean = s.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s.,;:!?—–-]+$/, "") + "…";
}

const GENERIC_TITLE_SEGMENTS = /^(home|welcome|index|homepage|untitled)$/i;

// "EverydayMaven™ | Whole Foods, Half the Time" → "EverydayMaven".
// Keeps the brand, drops the tagline and the trademark furniture. Falls back to a later segment
// when the first one is boilerplate like "Home", which would otherwise become the site's name.
export function cleanSiteTitle(raw: string, fallback: string): string {
  const decoded = stripTrademarkMarks(decodeHtmlEntities(raw));
  const segments = decoded
    .split(/\s*[|·•]\s*|\s+[–—]\s+|\s+-\s+/)
    .map((s) => collapseWhitespace(s))
    .filter(Boolean);
  const chosen = segments.find((s) => !GENERIC_TITLE_SEGMENTS.test(s)) ?? segments[0] ?? "";
  const out = collapseWhitespace(chosen);
  return out ? truncateAtWord(out, 60) : fallback;
}

// Meta descriptions arrive entity-encoded, trademark-laden, and occasionally identical to the
// title. Returns null rather than a useless line in those last cases.
export function cleanSiteDescription(raw: string | null | undefined, title: string): string | null {
  if (!raw) return null;
  const text = collapseWhitespace(stripTrademarkMarks(decodeHtmlEntities(stripTags(raw))));
  if (!text) return null;
  const normalizedTitle = title.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (text.toLowerCase().replace(/[.!?]+$/, "") === normalizedTitle) return null;
  if (text.length < 12) return null;
  return truncateAtWord(text, 165);
}

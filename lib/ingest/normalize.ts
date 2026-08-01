import { createHash } from "node:crypto";
import { normalizeForIntent } from "../search/intent";

// Normalisation, run before anything else touches a document. See spec §2.3.
//
// Steps 3-6 of the spec (language, dedupe, length floor, spam floor) typically remove 30-50% of
// raw volume at effectively zero cost, so they run BEFORE the classifier — every document dropped
// here is one that never costs an embedding call, storage, or an index slot.

export type RawDocument = {
  platform: string;
  externalId: string;
  url: string;
  authorRef: string;
  title?: string;
  body: string;
  postedAt: Date;
  parentExternalId?: string;
  engagement?: { score?: number; comments?: number };
};

export type NormalizedDocument = RawDocument & {
  body: string;
  contentHash: string;
  lang: string;
};

export type NormalizeDrop = "too_short" | "wrong_language" | "empty";

export const MIN_DOC_CHARS = 80;

/**
 * Language detection, deliberately crude. A real detector is a dependency and a per-document cost;
 * this only has to be good enough to drop obviously non-target text, which is the cheapest filter
 * in the entire pipeline. Anything ambiguous is kept — dropping a real lead to save an embedding
 * call is the wrong trade.
 */
export function looksEnglish(text: string): boolean {
  const sample = text.slice(0, 600).toLowerCase();
  if (!sample.trim()) return false;
  // A high proportion of CJK or Cyrillic is decisive; mixed scripts are not.
  const nonLatin = (sample.match(/[぀-ヿ一-鿿Ѐ-ӿ؀-ۿ]/g) ?? []).length;
  if (nonLatin > sample.length * 0.2) return false;
  const stopwords = ["the", "and", "is", "to", "of", "for", "with", "that", "have", "it", "we", "i", "a", "in", "on"];
  const words = sample.split(/\W+/).filter(Boolean);
  if (words.length < 8) return true; // too short to judge — keep it, the length floor handles it
  const hits = words.filter((w) => stopwords.includes(w)).length;
  return hits / words.length > 0.06;
}

export function contentHashOf(normalizedBody: string): string {
  return createHash("sha256").update(normalizedBody).digest("hex");
}

export function normalizeDocument(raw: RawDocument): { doc: NormalizedDocument } | { drop: NormalizeDrop } {
  // Strips quotes, code fences, signatures, and collapses whitespace. Quote-stripping matters most:
  // a need marker inside a quote belongs to the person being quoted, not this author.
  const body = normalizeForIntent(`${raw.title ? `${raw.title}\n` : ""}${raw.body}`);
  if (!body) return { drop: "empty" };
  if (body.length < MIN_DOC_CHARS) return { drop: "too_short" };
  if (!looksEnglish(body)) return { drop: "wrong_language" };

  return {
    doc: {
      ...raw,
      body,
      lang: "en",
      contentHash: contentHashOf(body),
    },
  };
}

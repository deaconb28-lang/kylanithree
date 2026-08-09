import { Corpus } from "./collections";

// The two Atlas indexes retrieval depends on, created by the worker rather than by hand.
//
// The handoff said for a long time that "the driver cannot create them — apply docs/atlas-indexes
// .json through the Atlas UI or CLI". That was true of the free tier and of older drivers; it is
// not true here. The Node driver has had `createSearchIndex` since v6, Atlas Search index
// management works from the driver on M10 and above, and the cluster is now M10. So the manual
// step that had been the single top blocker for months is just a function call.
//
// It lives in the worker because the worker is the only thing that both reaches Atlas and runs
// long enough to wait for a build. Vercel functions get killed well before an index finishes.
//
// Definitions here are the ones in docs/atlas-indexes.json, minus that file's `_comment` keys —
// Atlas rejects unknown fields inside a definition, so the documented copy cannot be passed
// straight through. Keep the two in step; the JSON stays the readable reference.

/** Lexical half of hybrid retrieval. Names, jargon, error strings — what embeddings get wrong. */
export const LEXICAL_INDEX = {
  name: "corpus_lexical",
  type: "search" as const,
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        title: { type: "string", analyzer: "lucene.english" },
        body: { type: "string", analyzer: "lucene.english" },
        problemStatement: { type: "string", analyzer: "lucene.english" },
        namedProducts: { type: "string", analyzer: "lucene.keyword" },
        intentType: { type: "token" },
        platform: { type: "token" },
        postedAt: { type: "date" },
      },
    },
  },
};

/**
 * Semantic half. 1024 dimensions because that is what Voyage returns — a mismatch here does not
 * error at build time, it silently returns nothing at query time, which is the worst failure shape
 * available. The filter paths are declared so `$vectorSearch` can pre-filter by intent and recency
 * in the same stage instead of over-fetching and filtering afterwards.
 */
export const VECTOR_INDEX = {
  name: "corpus_vector",
  type: "vectorSearch" as const,
  definition: {
    fields: [
      { type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" },
      { type: "filter", path: "intentType" },
      { type: "filter", path: "postedAt" },
      { type: "filter", path: "platform" },
    ],
  },
};

export type SearchIndexState = "created" | "exists" | "unsupported" | "failed";

export interface SearchIndexReport {
  name: string;
  state: SearchIndexState;
  detail?: string;
}

/**
 * True when Atlas is telling us this cluster cannot do search indexes at all — a shared tier, or a
 * self-hosted deployment. Distinct from a real failure, because the right response is different:
 * an unsupported cluster is a billing decision, a failure is a bug.
 */
function isUnsupported(message: string): boolean {
  return /not supported|no such command|SearchNotEnabled|only supported on Atlas|CommandNotSupported/i.test(message);
}

/** Already-exists is success. It is the normal state on every run after the first. */
function isAlreadyExists(message: string): boolean {
  return /already exists|IndexAlreadyExists|duplicate index/i.test(message);
}

/**
 * Creates both indexes if they are missing. Never throws.
 *
 * Index creation is infrastructure, not a precondition for crawling — the same rule
 * `ensureIngestIndexes()` already follows, and for the same reason: a bad index definition once
 * crash-looped the worker and stopped it collecting anything at all. Retrieval degrading is
 * survivable; a crawler that will not start is not.
 */
export async function ensureSearchIndexes(): Promise<SearchIndexReport[]> {
  const reports: SearchIndexReport[] = [];
  let corpus: Awaited<ReturnType<typeof Corpus>>;
  try {
    corpus = await Corpus();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return [
      { name: LEXICAL_INDEX.name, state: "failed", detail },
      { name: VECTOR_INDEX.name, state: "failed", detail },
    ];
  }

  // What already exists, so a re-run is a no-op rather than a pile of caught exceptions. Listing
  // is itself unsupported on a shared tier, so a failure here is not fatal — fall through and let
  // the create calls report the real reason.
  let existing = new Set<string>();
  try {
    const found = (await corpus.listSearchIndexes().toArray()) as { name?: string }[];
    existing = new Set(found.map((i) => i.name).filter((n): n is string => Boolean(n)));
  } catch {
    // Left empty on purpose.
  }

  for (const index of [LEXICAL_INDEX, VECTOR_INDEX]) {
    if (existing.has(index.name)) {
      reports.push({ name: index.name, state: "exists" });
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (corpus as any).createSearchIndex(index);
      reports.push({ name: index.name, state: "created" });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (isAlreadyExists(detail)) reports.push({ name: index.name, state: "exists" });
      else if (isUnsupported(detail)) reports.push({ name: index.name, state: "unsupported", detail });
      else reports.push({ name: index.name, state: "failed", detail });
    }
  }

  return reports;
}

/**
 * Whether an index is actually queryable yet.
 *
 * Creation returns immediately; the build takes minutes on a warm corpus. Until `queryable` is
 * true, `$search` against it still errors — which pass 1 would read as "the index is missing" and
 * quietly fall back to the regex scan. Being able to tell "still building" from "never created" is
 * the whole point of reporting this.
 */
export async function searchIndexStatus(): Promise<{ name: string; status?: string; queryable?: boolean }[]> {
  try {
    const corpus = await Corpus();
    const found = (await corpus.listSearchIndexes().toArray()) as {
      name?: string;
      status?: string;
      queryable?: boolean;
    }[];
    return found.map((i) => ({ name: i.name ?? "(unnamed)", status: i.status, queryable: i.queryable }));
  } catch {
    return [];
  }
}

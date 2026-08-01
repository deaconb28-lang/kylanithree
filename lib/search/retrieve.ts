import { Corpus } from "../ingest/collections";
import { embed, hasEmbeddingProvider } from "../ingest/embed";
import { fuseToPeople, type ResultList, type FusedPerson } from "./rrf";
import type { PlannedQuery } from "./queryPlan";
import type { IntentType } from "./intent";

// The query-time path. See docs/search-architecture.md §5.3.
//
// Index lookup plus fusion — no crawling, no model calls, nothing that can take 60 seconds. This is
// the whole point of moving discovery offline: retrieval against an index is milliseconds, and it
// is what makes "first rows in under three seconds" achievable at all.
//
// Both halves are load-bearing. The vector half handles paraphrase, which is most of how people
// describe a problem. The lexical half handles competitor names, product names, error strings and
// jargon — the queries where an embedding confidently returns something semantically similar but
// factually wrong. Roughly a third of the highest-value queries are name lookups, so skipping the
// lexical half to "simplify" would quietly break the best queries.

const VECTOR_INDEX = "corpus_vector";
const LEXICAL_INDEX = "corpus_lexical";

export type RetrievalHit = {
  documentId: string;
  personFingerprint: string;
  url: string;
  platform: string;
  authorRef: string;
  title?: string;
  body: string;
  problemStatement?: string;
  intentType?: IntentType;
  intentConfidence?: number;
  postedAt: Date;
};

type CorpusRow = {
  _id: unknown;
  personFingerprint: string;
  url: string;
  platform: string;
  authorRef: string;
  title?: string;
  body: string;
  problemStatement?: string;
  intentType?: IntentType;
  intentConfidence?: number;
  postedAt: Date;
};

const PROJECTION = {
  personFingerprint: 1,
  url: 1,
  platform: 1,
  authorRef: 1,
  title: 1,
  body: 1,
  problemStatement: 1,
  intentType: 1,
  intentConfidence: 1,
  postedAt: 1,
} as const;

function toHit(row: CorpusRow): RetrievalHit {
  return {
    documentId: String(row._id),
    personFingerprint: row.personFingerprint,
    url: row.url,
    platform: row.platform,
    authorRef: row.authorRef,
    title: row.title,
    body: row.body,
    problemStatement: row.problemStatement,
    intentType: row.intentType,
    intentConfidence: row.intentConfidence,
    postedAt: row.postedAt,
  };
}

/** Filters shared by both retrievers, so the two halves search exactly the same slice. */
function filtersFor(q: PlannedQuery) {
  const since = new Date(Date.now() - q.recencyDays * 86_400_000);
  const intentTypes = q.intentFilter.length ? q.intentFilter : undefined;
  return { since, intentTypes };
}

async function vectorSearch(q: PlannedQuery, vector: number[], k: number): Promise<RetrievalHit[]> {
  const corpus = await Corpus();
  const { since, intentTypes } = filtersFor(q);
  const filter: Record<string, unknown> = {
    postedAt: { $gte: since },
    // Only classified, intent-positive documents are ever searched. Everything else stays in the
    // corpus as a raw record — useful for author history — but never enters retrieval.
    intentType: intentTypes ? { $in: intentTypes } : { $ne: "none" },
  };

  return (
    await corpus
      .aggregate<CorpusRow>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector: vector,
            // numCandidates well above limit is what HNSW needs for decent recall; at parity the
            // index returns fast and badly.
            numCandidates: Math.max(k * 10, 400),
            limit: k,
            filter,
          },
        },
        { $project: PROJECTION },
      ])
      .toArray()
  ).map(toHit);
}

async function lexicalSearch(q: PlannedQuery, k: number): Promise<RetrievalHit[]> {
  const corpus = await Corpus();
  const { since, intentTypes } = filtersFor(q);

  const must: Record<string, unknown>[] = [
    {
      text: {
        query: q.text,
        // problemStatement is searched alongside the raw text because it is written in the same
        // register the planner writes queries in.
        path: ["title", "body", "problemStatement", "namedProducts"],
      },
    },
  ];
  const filter: Record<string, unknown>[] = [{ range: { path: "postedAt", gte: since } }];
  if (intentTypes) filter.push({ in: { path: "intentType", value: intentTypes } });

  return (
    await corpus
      .aggregate<CorpusRow>([
        { $search: { index: LEXICAL_INDEX, compound: { must, filter } } },
        { $limit: k },
        { $project: PROJECTION },
      ])
      .toArray()
  ).map(toHit);
}

export type RetrievalResult = {
  people: FusedPerson[];
  /** Every document seen, keyed by id — the caller needs these to show the evidence post. */
  documents: Map<string, RetrievalHit>;
  vectorAvailable: boolean;
  queriesRun: number;
  errors: number;
};

/**
 * Runs the whole plan against both indices in parallel and fuses the result.
 *
 * Degrades rather than fails, in two directions: with no embedding provider it runs lexical-only,
 * and an individual query that throws is counted and skipped. A search that returns fewer people is
 * a worse answer; a search that returns none because one retriever was unhappy is no answer.
 */
export async function retrieve(opts: {
  plan: PlannedQuery[];
  perQuery?: number;
  concurrency?: number;
}): Promise<RetrievalResult> {
  const { plan, perQuery = 120 } = opts;
  const documents = new Map<string, RetrievalHit>();
  const lists: ResultList[] = [];
  let errors = 0;

  const vectorAvailable = hasEmbeddingProvider();
  let vectors: number[][] = [];
  if (vectorAvailable && plan.length > 0) {
    try {
      // input_type "query", not "document" — Voyage encodes them differently, and using the wrong
      // one degrades recall silently rather than erroring.
      vectors = await embed({ texts: plan.map((q) => q.text), inputType: "query" });
    } catch (err) {
      console.error("[retrieve] Query embedding failed, falling back to lexical only:", err instanceof Error ? err.message : err);
      vectors = [];
    }
  }

  const settled = await Promise.allSettled(
    plan.map(async (q, i) => {
      const halves = await Promise.allSettled([
        vectors[i] ? vectorSearch(q, vectors[i], perQuery) : Promise.resolve([] as RetrievalHit[]),
        lexicalSearch(q, perQuery),
      ]);
      const out: { query: PlannedQuery; hitLists: RetrievalHit[][] } = { query: q, hitLists: [] };
      for (const h of halves) {
        if (h.status === "fulfilled") out.hitLists.push(h.value);
        else errors += 1;
      }
      return out;
    }),
  );

  for (const s of settled) {
    if (s.status !== "fulfilled") {
      errors += 1;
      continue;
    }
    const { query, hitLists } = s.value;
    for (const hits of hitLists) {
      if (hits.length === 0) continue;
      for (const h of hits) documents.set(h.documentId, h);
      lists.push({
        query: query.text,
        weight: query.weight,
        // RRF reads rank only, so the two lists never have to agree on what a good score is —
        // which is exactly the problem with blending a cosine similarity and a BM25 score.
        hits: hits.map((h) => ({ documentId: h.documentId, personId: h.personFingerprint })),
      });
    }
  }

  return {
    people: fuseToPeople(lists),
    documents,
    vectorAvailable: vectors.length > 0,
    queriesRun: plan.length,
    errors,
  };
}

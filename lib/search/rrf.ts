// Reciprocal rank fusion, then collapse to people. See docs/search-architecture.md §5.3.
//
// RRF is the right fusion for a hybrid index because it needs no score calibration between the two
// retrievers — which is precisely the problem with blending a cosine similarity and a BM25 score
// directly. It only reads RANK, so the two lists never have to agree on what a "good" score is.

/** The standard RRF damping constant. Higher flattens the curve; 60 is the published default. */
export const RRF_K = 60;

export type RankedHit = {
  documentId: string;
  personId: string;
};

export type ResultList = {
  /** Which planned query produced this list, so a person can report what matched them. */
  query: string;
  /** How central that query was to the brief. */
  weight: number;
  hits: RankedHit[];
};

export type FusedPerson = {
  personId: string;
  /** The single strongest document — this becomes the evidence post shown in the UI. */
  bestDocumentId: string;
  score: number;
  /** Distinct queries this person matched. Breadth of match is itself a signal. */
  matchedQueries: string[];
  matchingDocumentCount: number;
};

/**
 * Fuses ranked lists and collapses to one row per person.
 *
 * The collapse is the important half. A person surfacing across forty posts is ONE lead — keying
 * results on the document instead would let a single prolific poster fill the entire result set.
 */
export function fuseToPeople(lists: ResultList[]): FusedPerson[] {
  // document -> accumulated RRF score
  const docScore = new Map<string, number>();
  const docPerson = new Map<string, string>();
  // person -> the queries that surfaced them
  const personQueries = new Map<string, Set<string>>();
  const personDocs = new Map<string, Set<string>>();

  for (const list of lists) {
    const weight = Number.isFinite(list.weight) ? Math.max(0, list.weight) : 1;
    list.hits.forEach((hit, index) => {
      const contribution = weight * (1 / (RRF_K + index + 1));
      docScore.set(hit.documentId, (docScore.get(hit.documentId) ?? 0) + contribution);
      docPerson.set(hit.documentId, hit.personId);

      const queries = personQueries.get(hit.personId) ?? new Set<string>();
      queries.add(list.query);
      personQueries.set(hit.personId, queries);

      const docs = personDocs.get(hit.personId) ?? new Set<string>();
      docs.add(hit.documentId);
      personDocs.set(hit.personId, docs);
    });
  }

  const best = new Map<string, { documentId: string; score: number }>();
  for (const [documentId, score] of docScore) {
    const personId = docPerson.get(documentId);
    if (!personId) continue;
    const current = best.get(personId);
    if (!current || score > current.score) best.set(personId, { documentId, score });
  }

  const out: FusedPerson[] = [];
  for (const [personId, { documentId, score }] of best) {
    const docCount = personDocs.get(personId)?.size ?? 1;
    // Rewards someone who surfaced across several independent queries, but logarithmically — so
    // breadth of match helps without letting one very prolific poster run away with the ranking.
    const breadthBonus = 0.15 * Math.log(1 + docCount);
    out.push({
      personId,
      bestDocumentId: documentId,
      score: score + breadthBonus,
      matchedQueries: [...(personQueries.get(personId) ?? [])],
      matchingDocumentCount: docCount,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

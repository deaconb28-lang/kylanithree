import { getDb } from "../mongodb";
import type { IntentType } from "../search/intent";

// The corpus. See docs/search-architecture.md.
//
// TRANSLATION NOTE — the spec is written for Postgres, where `documents`, `intents` and
// `doc_vectors` are three tables joined at query time. On Atlas they are ONE collection, because
// both $vectorSearch and $search must be the first stage of an aggregation and operate on a single
// collection. Splitting them would force a $lookup after retrieval, which defeats the point of
// having an index at all.
//
// So: intent fields and the embedding live on the document. The logical model is unchanged.

export type SourceHealth = "ok" | "degraded" | "blocked" | "retired";
export type AccessMethod = "api" | "rss" | "json" | "scrape";

export interface SourceDoc {
  platform: string; // reddit | hn | discourse | x | stackexchange | quora
  identifier: string; // subreddit name, forum host, tag — "all" for flat sources like HN
  accessMethod: AccessMethod;
  baseUrl?: string;
  /** Minutes. Adapted from observed yield: a source producing 40 hits a day gets polled often. */
  pollIntervalMinutes: number;
  lastPolled?: Date;
  /** Platform-native pagination token, so a poll resumes rather than re-reading from the top. */
  lastCursor?: string;
  health: SourceHealth;
  /** Documents that PASSED the intent filter in the last 30 days. Drives scheduler priority. */
  docYield30d: number;
  enabled: boolean;
  /** Set when the fallback crawler discovered this source, so it can be reviewed before trusting. */
  discovered?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CorpusDoc {
  sourceId: string;
  platform: string;
  /** The platform's own ID. Unique with platform — this is what makes re-polling idempotent. */
  externalId: string;
  url: string;
  parentExternalId?: string;
  authorRef: string;
  /** Stable person key, so retrieval can collapse to people without a join. */
  personFingerprint: string;
  title?: string;
  body: string;
  lang?: string;
  postedAt: Date;
  fetchedAt: Date;
  engagement?: { score?: number; comments?: number };
  /** sha256 of the normalized body. Crossposts and mirrors are rampant. */
  contentHash: string;

  // --- intent (Postgres `intents` table, inlined) ---
  intentType?: IntentType;
  intentConfidence?: number;
  /** Normalized one-line restatement, in a neutral register. See the note in §3.3 of the spec. */
  problemStatement?: string;
  namedProducts?: string[];
  roleGuess?: string;
  companyContext?: string;
  urgency?: string;
  classifierStage?: 1 | 2 | 3;
  /** Failed classification attempts. Stops one poison document blocking the queue forever. */
  classifyAttempts?: number;
  lexiconVersion?: number;
  modelVersion?: string;
  classifiedAt?: Date;

  // --- vector (Postgres `doc_vectors`, inlined) ---
  embedding?: number[];
  embeddingModel?: string;
}

export interface PersonDoc {
  fingerprint: string;
  platform: string;
  handle: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  firstSeen: Date;
  lastSeen: Date;
  postCount: number;
  accountAgeDays?: number;
  /** Proxy for "is this a real active human". Filters bots; does not rank leads. */
  activityScore: number;
}

export async function Sources() {
  return (await getDb()).collection<SourceDoc>("sources");
}

export async function Corpus() {
  return (await getDb()).collection<CorpusDoc>("corpus");
}

export async function People() {
  return (await getDb()).collection<PersonDoc>("people");
}

/**
 * Ordinary btree indexes. The Atlas Search and Vector Search indexes are NOT created here —
 * they are cluster-level resources defined in `docs/atlas-indexes.json` and applied through the
 * Atlas UI or CLI, because the driver cannot create them.
 */
export async function ensureIngestIndexes(): Promise<void> {
  const [sources, corpus, people] = await Promise.all([Sources(), Corpus(), People()]);
  await Promise.all([
    sources.createIndex({ platform: 1, identifier: 1 }, { unique: true, name: "source_identity" }),
    sources.createIndex({ enabled: 1, health: 1, lastPolled: 1 }, { name: "source_due" }),
    // Re-polling a source re-sees the same posts constantly; this is what makes ingest idempotent.
    corpus.createIndex({ platform: 1, externalId: 1 }, { unique: true, name: "doc_identity" }),
    corpus.createIndex({ contentHash: 1 }, { name: "doc_content_hash" }),
    corpus.createIndex({ postedAt: -1 }, { name: "doc_recency" }),
    corpus.createIndex({ personFingerprint: 1 }, { name: "doc_person" }),
    // The retrieval filter: only classified, intent-positive documents are ever searched.
    corpus.createIndex({ intentType: 1, intentConfidence: -1 }, { name: "doc_intent" }),
    // Finds the backlog for the classifier worker.
    corpus.createIndex({ classifierStage: 1, classifyAttempts: 1, fetchedAt: 1 }, { name: "doc_unclassified" }),
    people.createIndex({ fingerprint: 1 }, { unique: true, name: "person_identity" }),
  ]);
}

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
  /**
   * The platform's own stable id for the author, when it gives one that differs from `authorRef`.
   * Stack Exchange is the case that forces this: its posts carry `owner.display_name`, which is
   * neither unique nor addressable, while every profile lookup needs the numeric `user_id`.
   * Never part of the fingerprint — it is a lookup handle, not an identity.
   */
  authorId?: string;
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
  /**
   * Which repair pass has already restored this document's attempts. Stops `repairClassifyBacklog`
   * giving a genuinely unclassifiable document infinite retries — it gets its three back once per
   * repair version, never in a loop.
   */
  classifyRepair?: number;
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
  /**
   * Which instance of the platform this person posts on — a Discourse host, a Stack Exchange site,
   * "all" for flat sources like HN. Profile lookups are per-instance, so enrichment cannot find
   * anyone without it.
   */
  scope?: string;
  /** Platform-native id, when the platform uses one for profile lookups (Stack Exchange). */
  authorId?: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  firstSeen: Date;
  lastSeen: Date;
  postCount: number;
  accountAgeDays?: number;
  /** Proxy for "is this a real active human". Filters bots; does not rank leads. */
  activityScore: number;

  // --- enrichment (the person-scraping pass) ---
  /** Set once a profile fetch has succeeded. Absent means "still in the backlog". */
  enrichedAt?: Date;
  /** Failed lookups. Stops one deleted or private profile being retried forever. */
  enrichAttempts?: number;
  /** Platform-reported reputation/karma, normalised to a number. Not comparable across platforms. */
  reputation?: number;
  /** Public post/answer count as the platform reports it, which is broader than what we crawled. */
  platformPostCount?: number;
}

/**
 * One row per unit of scraping work — a source poll, a pass-1 corpus read, a live-shallow fetch.
 *
 * This exists because the failure mode this system actually has is a silent one. A search that
 * returns nothing looks identical whether the corpus was cold, an index was missing, a source 403'd
 * or a budget expired, and `sources.health` only records the last of those. The question worth
 * answering afterwards is "which source failed, and why", and it has to be answerable from stored
 * rows rather than from a log line that has already scrolled away in Railway.
 */
export interface ScrapeLogDoc {
  /** Ties every row from one run together: a `searchId` for query-time work, a tick id for crawls. */
  correlationId: string;
  /** "crawl" | "pass_one_corpus" | "pass_one_live" | "pass_two" — what kind of work this was. */
  phase: string;
  /** Platform plus instance, e.g. "stackexchange:cooking". "corpus" for an index read. */
  source: string;
  startedAt: Date;
  ms: number;
  /** Documents, leads or people — whatever the phase produces. Zero is a real, useful answer. */
  itemsFound: number;
  /** True when the phase returned early because its budget expired rather than because it finished. */
  budgetHit: boolean;
  /** Present only on failure. The technical message, since nothing here is shown to a customer. */
  error?: string;
}

export async function Sources() {
  return (await getDb()).collection<SourceDoc>("sources");
}

export async function ScrapeLog() {
  return (await getDb()).collection<ScrapeLogDoc>("scrape_log");
}

/**
 * Records one unit of work. Never throws and never blocks the caller's result: a logging failure
 * must not be able to fail a search, which would invert the entire point of having the log.
 */
export async function logScrape(entry: ScrapeLogDoc): Promise<void> {
  try {
    (await ScrapeLog()).insertOne(entry).catch(() => {});
  } catch {
    // Mongo unreachable. The console line from the caller is still the record in that case.
  }
}

export async function Corpus() {
  return (await getDb()).collection<CorpusDoc>("corpus");
}

export async function People() {
  return (await getDb()).collection<PersonDoc>("people");
}

/**
 * Ordinary btree indexes. The Atlas Search and Vector Search indexes are created separately, by
 * `lib/ingest/searchIndexes.ts` — the note that used to be here saying the driver cannot create
 * them was true of the free tier and is not true on M10 with driver v6.
 */
export async function ensureIngestIndexes(): Promise<void> {
  const [sources, corpus, people, scrapeLog] = await Promise.all([Sources(), Corpus(), People(), ScrapeLog()]);

  // Every index is attempted independently and NO failure is fatal.
  //
  // This is the fix for a real outage: `doc_unclassified` was redefined with an extra key while
  // keeping its name, MongoDB rejected the conflicting definition, ensureIngestIndexes() threw, and
  // the worker crash-looped on startup — unable to crawl at all because of a query optimisation.
  //
  // Index creation is best-effort infrastructure, not a correctness invariant. Every query here
  // returns correct results without its index; it just scans more. Losing the crawler over that
  // trade is never right.
  type Spec = [ReturnType<typeof Object>, Record<string, 1 | -1>, { name: string; unique?: boolean }];
  const specs: Spec[] = [
    [sources, { platform: 1, identifier: 1 }, { name: "source_identity", unique: true }],
    [sources, { enabled: 1, health: 1, lastPolled: 1 }, { name: "source_due" }],
    // Re-polling a source re-sees the same posts constantly; this is what makes ingest idempotent.
    [corpus, { platform: 1, externalId: 1 }, { name: "doc_identity", unique: true }],
    [corpus, { contentHash: 1 }, { name: "doc_content_hash" }],
    [corpus, { postedAt: -1 }, { name: "doc_recency" }],
    [corpus, { personFingerprint: 1 }, { name: "doc_person" }],
    // The retrieval filter: only classified, intent-positive documents are ever searched.
    [corpus, { intentType: 1, intentConfidence: -1 }, { name: "doc_intent" }],
    // Finds the backlog for the classifier worker. Named _v2 because the v1 index has the same name
    // but a different key, and MongoDB will not redefine one in place — a rename is the migration.
    [corpus, { classifierStage: 1, classifyAttempts: 1, fetchedAt: 1 }, { name: "doc_unclassified_v2" }],
    [people, { fingerprint: 1 }, { name: "person_identity", unique: true }],
    // The enrichment backlog: people never successfully looked up, fewest attempts first. Mongo
    // does NOT match a missing field with {$lt: n}, so the worker's query uses {$not: {$gte: n}} —
    // this index has to serve that shape, which is why enrichAttempts leads over lastSeen.
    [people, { enrichedAt: 1, enrichAttempts: 1, lastSeen: -1 }, { name: "person_enrich_backlog" }],
    // "show me everything that happened during this run", which is the question a silent empty
    // result actually raises.
    [scrapeLog, { correlationId: 1, startedAt: -1 }, { name: "scrape_correlation" }],
    // "which sources are failing lately", across runs.
    [scrapeLog, { source: 1, startedAt: -1 }, { name: "scrape_source_recent" }],
  ];

  for (const [collection, keys, options] of specs) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (collection as any).createIndex(keys, options);
    } catch (err) {
      console.error(`[ingest] index ${options.name} not created:`, err instanceof Error ? err.message : err);
    }
  }

  // scrape_log is append-only and grows with every tick forever, so it prunes itself. 30 days is
  // well past the point where a specific run is still being investigated. Separate from the specs
  // above because a TTL index needs `expireAfterSeconds`, which that tuple shape does not carry.
  try {
    await scrapeLog.createIndex({ startedAt: 1 }, { name: "scrape_ttl", expireAfterSeconds: 30 * 86_400 });
  } catch (err) {
    console.error("[ingest] index scrape_ttl not created:", err instanceof Error ? err.message : err);
  }

  // The superseded index still costs writes for a query nothing runs any more. Dropping it is a
  // tidy-up, so a failure here is even less interesting than one above.
  try {
    await corpus.dropIndex("doc_unclassified");
    console.error("[ingest] dropped superseded index doc_unclassified");
  } catch {
    // Already gone, or never existed on this cluster. Either is fine.
  }
}

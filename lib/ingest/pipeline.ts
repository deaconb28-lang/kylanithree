import { ObjectId } from "mongodb";
import { Corpus, People, Sources, type CorpusDoc } from "./collections";
import { normalizeDocument, type RawDocument } from "./normalize";
import { lexicalGate } from "../search/intent";
import { LEXICON_VERSION } from "../search/intent";
import { personFingerprint } from "../credits/fingerprint";
import { classifyBatch, needsReview, CLASSIFIER_VERSION, CLASSIFY_BATCH_SIZE, type ClassifyInput } from "./classify";
import { embed, embeddingInput, hasEmbeddingProvider, EMBED_MODEL, EMBED_BATCH_SIZE } from "./embed";

// normalize -> gate -> store -> classify -> resolve person.
//
// Split deliberately into an ingest pass and a classify pass rather than one pipeline. Storing
// gate survivors immediately means a crawl is never lost when the classifier is slow, rate limited
// or down — the backlog just grows and drains later. Coupling them would make every model outage a
// crawl outage.

export type IngestStats = {
  fetched: number;
  droppedShort: number;
  droppedLanguage: number;
  droppedGate: number;
  duplicates: number;
  stored: number;
};

/**
 * Ingest pass. Everything here is cheap: no model calls, no embeddings. Documents land
 * unclassified (`classifierStage: 1`) for the classify pass to pick up.
 */
export async function ingestDocuments(opts: { sourceId: string; documents: RawDocument[] }): Promise<IngestStats> {
  const { sourceId, documents } = opts;
  const stats: IngestStats = {
    fetched: documents.length,
    droppedShort: 0,
    droppedLanguage: 0,
    droppedGate: 0,
    duplicates: 0,
    stored: 0,
  };
  if (documents.length === 0) return stats;

  const corpus = await Corpus();
  const seenHashes = new Set<string>();
  const toStore: CorpusDoc[] = [];
  // Scope belongs to the person, not the document, so it is carried alongside rather than stored on
  // every row — the corpus already namespaces platform+externalId and does not need it twice.
  const scopeByFingerprint = new Map<string, string>();
  const now = new Date();

  for (const raw of documents) {
    const normalized = normalizeDocument(raw);
    if ("drop" in normalized) {
      if (normalized.drop === "wrong_language") stats.droppedLanguage += 1;
      else stats.droppedShort += 1;
      continue;
    }
    const doc = normalized.doc;

    // Crossposts and mirrors are rampant; within-batch dedupe is free.
    if (seenHashes.has(doc.contentHash)) {
      stats.duplicates += 1;
      continue;
    }
    seenHashes.add(doc.contentHash);

    // Stage 1. Microseconds, no model call, and it removes the overwhelming majority.
    if (!lexicalGate(doc.body).passed) {
      stats.droppedGate += 1;
      continue;
    }

    const fingerprint = personFingerprint({ platform: doc.platform, authorHandle: doc.authorRef });
    if (!fingerprint) continue;
    if (doc.authorScope) scopeByFingerprint.set(fingerprint, doc.authorScope);

    toStore.push({
      sourceId,
      platform: doc.platform,
      externalId: doc.externalId,
      url: doc.url,
      parentExternalId: doc.parentExternalId,
      authorRef: doc.authorRef,
      authorId: doc.authorId,
      personFingerprint: fingerprint,
      title: doc.title,
      body: doc.body,
      lang: doc.lang,
      postedAt: doc.postedAt,
      fetchedAt: now,
      engagement: doc.engagement,
      contentHash: doc.contentHash,
      classifierStage: 1,
      lexiconVersion: LEXICON_VERSION,
    });
  }

  if (toStore.length > 0) {
    // Upsert on (platform, externalId) so re-polling the same window is idempotent. $setOnInsert
    // rather than $set: re-seeing a document must never reset a classification already made.
    const ops = toStore.map((d) => ({
      updateOne: {
        filter: { platform: d.platform, externalId: d.externalId },
        update: { $setOnInsert: d },
        upsert: true,
      },
    }));
    const res = await corpus.bulkWrite(ops, { ordered: false });
    stats.stored = res.upsertedCount ?? 0;
    stats.duplicates += toStore.length - stats.stored;
  }

  await resolvePeople(toStore, scopeByFingerprint);
  return stats;
}

/** Person resolution. Runs per ingest batch; cross-platform linking is a separate, slower job. */
async function resolvePeople(docs: CorpusDoc[], scopeByFingerprint?: Map<string, string>): Promise<void> {
  if (docs.length === 0) return;
  const people = await People();
  const byFingerprint = new Map<string, CorpusDoc[]>();
  for (const d of docs) {
    const bucket = byFingerprint.get(d.personFingerprint);
    if (bucket) bucket.push(d);
    else byFingerprint.set(d.personFingerprint, [d]);
  }

  const ops = [...byFingerprint.entries()].map(([fingerprint, theirDocs]) => {
    const newest = theirDocs.reduce((a, b) => (a.postedAt > b.postedAt ? a : b));
    const oldest = theirDocs.reduce((a, b) => (a.postedAt < b.postedAt ? a : b));
    const scope = scopeByFingerprint?.get(fingerprint);
    // The lookup keys are $set, not $setOnInsert: a person first seen before enrichment existed
    // has neither, and would otherwise sit in the backlog forever being skipped for want of a
    // scope we now have in hand. Identity fields stay $setOnInsert — those must never move.
    const lookupKeys: Record<string, string> = {};
    if (scope) lookupKeys.scope = scope;
    const withAuthorId = theirDocs.find((d) => d.authorId);
    if (withAuthorId?.authorId) lookupKeys.authorId = withAuthorId.authorId;

    return {
      updateOne: {
        filter: { fingerprint },
        update: {
          $setOnInsert: {
            fingerprint,
            platform: newest.platform,
            handle: newest.authorRef,
            firstSeen: oldest.postedAt,
            activityScore: 0.5,
          },
          ...(Object.keys(lookupKeys).length > 0 ? { $set: lookupKeys } : {}),
          $max: { lastSeen: newest.postedAt },
          $inc: { postCount: theirDocs.length },
        },
        upsert: true,
      },
    };
  });
  await people.bulkWrite(ops, { ordered: false });
}

// Three tries, then the document is left unclassified rather than retried indefinitely. It stays
// in the corpus as a raw record — useful for author history — it just never enters retrieval.
const MAX_CLASSIFY_ATTEMPTS = 3;

export type ClassifyStats = {
  considered: number;
  classified: number;
  leads: number;
  none: number;
  forReview: number;
  embedded: number;
};

/**
 * Classify pass. Drains the unclassified backlog oldest-first in batches.
 *
 * Documents the model omits from its response are left unclassified rather than marked `none` —
 * a dropped item is a retry, not a verdict.
 */
export async function classifyBacklog(opts: { limit?: number; timeoutMs?: number }): Promise<ClassifyStats> {
  const { limit = CLASSIFY_BATCH_SIZE, timeoutMs } = opts;
  const corpus = await Corpus();
  const stats: ClassifyStats = { considered: 0, classified: 0, leads: 0, none: 0, forReview: 0, embedded: 0 };

  // Documents that have already failed MAX_CLASSIFY_ATTEMPTS times are skipped. Without this a
  // single document the model cannot produce valid output for sits at the head of the
  // oldest-first queue forever, and every tick pays for a full model call to fail on it again.
  //
  // $not/$gte rather than $lt, and the difference is not cosmetic: in MongoDB `{f: {$lt: 3}}`
  // requires the field to EXIST. Every document stored before this counter was introduced has no
  // `classifyAttempts` at all, so $lt would have excluded the entire existing backlog and quietly
  // stalled the classifier. $not/$gte matches a missing field as well as a low one.
  const pending = await corpus
    .find({ classifierStage: 1, classifyAttempts: { $not: { $gte: MAX_CLASSIFY_ATTEMPTS } } })
    .sort({ fetchedAt: 1 })
    .limit(limit)
    .toArray();
  stats.considered = pending.length;
  if (pending.length === 0) return stats;

  const inputs: ClassifyInput[] = pending.map((d) => ({
    id: String(d._id),
    platform: d.platform,
    title: d.title,
    body: d.body,
    postedAt: d.postedAt,
  }));

  let verdicts;
  try {
    verdicts = await classifyBatch({ documents: inputs, timeoutMs });
  } catch (err) {
    // Charge the whole batch an attempt. A structured-output rejection is a property of one
    // document's content, but we cannot tell which, so the batch shares the cost — and after a few
    // tries the offenders drop out and the rest classify normally on their own.
    await corpus.updateMany({ _id: { $in: pending.map((d) => d._id) } }, { $inc: { classifyAttempts: 1 } });
    throw err;
  }
  const byId = new Map(pending.map((d) => [String(d._id), d]));
  const now = new Date();

  const ops = verdicts
    .filter((v) => byId.has(v.id))
    .map((v) => {
      stats.classified += 1;
      if (v.intentType === "none") stats.none += 1;
      else stats.leads += 1;
      if (needsReview(v)) stats.forReview += 1;
      return {
        updateOne: {
          filter: { _id: byId.get(v.id)!._id },
          update: {
            $set: {
              intentType: v.intentType,
              intentConfidence: v.confidence,
              problemStatement: v.problemStatement,
              namedProducts: v.namedProducts,
              roleGuess: v.roleGuess,
              companyContext: v.companyContext,
              urgency: v.urgency,
              classifierStage: 3 as const,
              modelVersion: CLASSIFIER_VERSION,
              classifiedAt: now,
            },
          },
        },
      };
    });

  if (ops.length > 0) await corpus.bulkWrite(ops, { ordered: false });

  // Anything the model silently omitted from its response also counts as an attempt, or an
  // always-skipped document would loop just as forever as a failing one.
  const answered = new Set(verdicts.map((v) => v.id));
  const unanswered = pending.filter((d) => !answered.has(String(d._id))).map((d) => d._id);
  if (unanswered.length > 0) {
    await corpus.updateMany({ _id: { $in: unanswered } }, { $inc: { classifyAttempts: 1 } });
  }

  // Embed only what turned out to be a lead. A document classified `none` never enters retrieval,
  // so embedding it would be paying for a vector nothing can ever match against.
  stats.embedded = await embedClassified(verdicts.filter((v) => v.intentType !== "none").map((v) => v.id));
  return stats;
}

/**
 * Writes embeddings for freshly classified leads.
 *
 * Failure here is non-fatal by design: the document keeps its classification and simply has no
 * vector, which degrades that document to lexical-only retrieval rather than losing it. A backfill
 * pass can pick it up later, which is why this queries for a MISSING embedding rather than tracking
 * a separate flag.
 */
async function embedClassified(documentIds: string[]): Promise<number> {
  if (documentIds.length === 0 || !hasEmbeddingProvider()) return 0;
  const corpus = await Corpus();
  try {
    const docs = await corpus
      .find({ _id: { $in: documentIds.map((id) => new ObjectId(id)) }, embedding: { $exists: false } })
      .toArray();
    if (docs.length === 0) return 0;

    let written = 0;
    for (let i = 0; i < docs.length; i += EMBED_BATCH_SIZE) {
      const batch = docs.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await embed({ texts: batch.map(embeddingInput), inputType: "document" });
      await corpus.bulkWrite(
        batch.map((d, j) => ({
          updateOne: { filter: { _id: d._id }, update: { $set: { embedding: vectors[j], embeddingModel: EMBED_MODEL } } },
        })),
        { ordered: false },
      );
      written += batch.length;
    }
    return written;
  } catch (err) {
    console.error("[ingest] Embedding failed, documents stay lexical-only:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Backfills embeddings for intent-positive documents that never got one — because the provider was
 * unset when they were classified, or a batch failed. Safe to run repeatedly.
 */
export async function backfillEmbeddings(limit = EMBED_BATCH_SIZE): Promise<number> {
  if (!hasEmbeddingProvider()) return 0;
  const corpus = await Corpus();
  const docs = await corpus
    .find({ intentType: { $exists: true, $ne: "none" }, embedding: { $exists: false } })
    .limit(limit)
    .toArray();
  if (docs.length === 0) return 0;
  return embedClassified(docs.map((d) => String(d._id)));
}

/**
 * Recomputes `docYield30d` — documents that PASSED the intent filter, not documents fetched. This
 * is what the scheduler orders by, so it has to measure the thing that actually matters.
 */
export async function refreshSourceYield(sourceId: string): Promise<number> {
  const corpus = await Corpus();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const yield30d = await corpus.countDocuments({
    sourceId,
    fetchedAt: { $gte: since },
    intentType: { $exists: true, $ne: "none" },
  });

  const sources = await Sources();
  await sources.updateOne(
    { _id: new ObjectId(sourceId) },
    { $set: { docYield30d: yield30d, pollIntervalMinutes: pollIntervalForYield(yield30d), updatedAt: new Date() } },
  );
  return yield30d;
}

/**
 * Adapts polling frequency to observed yield. A subreddit producing 40 intent-positive posts a day
 * earns a 10-minute interval; one producing two a week does not, and polling it as often just burns
 * rate limit that a productive source could have used.
 */
export function pollIntervalForYield(docYield30d: number): number {
  const perDay = docYield30d / 30;
  if (perDay >= 30) return 10;
  if (perDay >= 10) return 20;
  if (perDay >= 3) return 60;
  if (perDay >= 1) return 240;
  return 1440;
}

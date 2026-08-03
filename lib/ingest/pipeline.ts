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
export const MAX_CLASSIFY_ATTEMPTS = 3;

/**
 * Is this failure about the ACCOUNT or the SERVICE rather than about the documents in the batch?
 *
 * This distinction was missing and it cost most of the corpus.
 *
 * `classifyBacklog` charges every document in a failed batch an attempt, on the reasoning that a
 * structured-output rejection is caused by one document's content and we cannot tell which. That
 * reasoning is sound for a content failure and completely wrong for anything else. When the
 * Anthropic balance ran out, every batch threw `400 "Your credit balance is too low"`, the catch
 * charged 20 documents an attempt, and the tick did it up to six times — so thousands of perfectly
 * good documents burned through all three attempts within minutes and were permanently excluded
 * from the backlog query. The corpus did not stall because classification was slow; it stalled
 * because an outage was recorded as a verdict about the text.
 *
 * So the default is NOT to charge. A document is only penalised when the failure is plausibly its
 * own fault, which keeps the poison-document protection this counter exists for while making it
 * impossible for a billing lapse, a rate limit, a network blip or a Anthropic outage to condemn
 * anything.
 */
export function isInfrastructureFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  // 401/403 auth, 404 wrong model, 408 timeout, 429 rate limit, 5xx upstream — none of these ever
  // say anything about a post's content.
  if (typeof status === "number" && (status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500)) {
    return true;
  }
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  // A 400 is the ambiguous one: it covers both "your balance is too low" and a genuine malformed
  // request. Matched on the message rather than assumed either way.
  if (/credit balance|billing|quota|insufficient|payment|rate.?limit|overloaded|capacity/.test(message)) return true;
  if (/timeout|timed out|aborted|socket|econn|enotfound|network|fetch failed/.test(message)) return true;
  return false;
}

/**
 * Bump to run the repair again over documents it has already touched.
 *
 * v1 undoes the credit outage: every document that never got a verdict but had burned all three
 * attempts, plus anything stored before `classifierStage` existed, which the backlog query filters
 * on and would therefore never see.
 */
const CLASSIFY_REPAIR_VERSION = 1;

export type ClassifyRepairStats = { unblocked: number; staged: number };

/**
 * How many documents are still waiting on a verdict.
 *
 * Counted the same way `/api/health` counts it — on the absence of `intentType`, which is the field
 * retrieval actually filters on. Deliberately NOT counted on the backlog query's own filter: that
 * would report zero whenever documents are stuck outside the queue, which is precisely the failure
 * this number is here to notice.
 */
export async function unclassifiedCount(): Promise<number> {
  return (await Corpus()).countDocuments({ intentType: { $exists: false } });
}

/**
 * Make every unclassified document eligible for the classifier again.
 *
 * Two populations are stuck, for two different reasons, and both are invisible — the collection
 * simply stops growing its searchable half while the crawler keeps reporting healthy numbers:
 *
 *   1. Documents whose `classifyAttempts` hit the maximum during an outage. They were never judged;
 *      they were charged for the API being unavailable. Resetting the counter is not "retrying a
 *      failure", it is undoing an accounting error.
 *   2. Documents with no `classifierStage` at all — anything stored before that field was
 *      introduced. The backlog query filters on `classifierStage: 1`, so these were never in the
 *      queue in the first place and no amount of waiting would have classified them.
 *
 * Idempotent and bounded. Each document is stamped with the repair version, so a genuinely
 * unclassifiable document gets its three attempts back exactly once rather than looping forever —
 * which is the failure the attempt counter exists to prevent, and this must not reintroduce it.
 */
export async function repairClassifyBacklog(): Promise<ClassifyRepairStats> {
  const corpus = await Corpus();
  const stats: ClassifyRepairStats = { unblocked: 0, staged: 0 };

  const unblocked = await corpus.updateMany(
    {
      intentType: { $exists: false },
      classifyAttempts: { $gte: MAX_CLASSIFY_ATTEMPTS },
      classifyRepair: { $ne: CLASSIFY_REPAIR_VERSION },
    },
    { $set: { classifyAttempts: 0, classifierStage: 1, classifyRepair: CLASSIFY_REPAIR_VERSION } },
  );
  stats.unblocked = unblocked.modifiedCount;

  const staged = await corpus.updateMany(
    { intentType: { $exists: false }, classifierStage: { $exists: false } },
    { $set: { classifierStage: 1 } },
  );
  stats.staged = staged.modifiedCount;

  return stats;
}

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
    // Charge the batch an attempt ONLY when the failure could be about its content. A
    // structured-output rejection is a property of one document, and we cannot tell which, so the
    // batch shares the cost and the offenders drop out after a few tries.
    //
    // An infrastructure failure charges nothing. See isInfrastructureFailure — treating an
    // exhausted balance as a verdict about the text is what condemned most of this corpus.
    if (!isInfrastructureFailure(err)) {
      await corpus.updateMany({ _id: { $in: pending.map((d) => d._id) } }, { $inc: { classifyAttempts: 1 } });
    }
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

import { getDb } from "../mongodb";

// A hard ceiling on paid classification, per day.
//
// This exists because the worker ran up ~$150 in a single day. Classification is the only step here
// that costs money and it runs forever, so "how fast should it go" is really "how much should this
// cost", and until now nothing in the system could answer that or stop it.
//
// Deliberately counted in Mongo rather than in memory. A process-local counter resets on every
// deploy and every restart, which on Railway is often — so the one thing a runaway would reliably
// do is clear its own budget. A shared counter survives that.
//
// A cap that stops work silently would recreate the exact failure this codebase spent a day
// undoing: the corpus stops growing, retrieval quietly thins out, and nothing anywhere says why.
// So hitting it logs loudly and `/api/health` can read the same row.

/**
 * Batches of 20 documents per UTC day.
 *
 * 1,500 batches is 30,000 documents — comfortably above the observed crawl rate of roughly 13
 * documents a minute (~19,000/day), so in normal operation this is never reached. It is a
 * runaway guard, not a throttle. At Haiku pricing with 1,200-character bodies a batch is on the
 * order of a cent and a half, which puts the worst case near $20/day rather than $150.
 */
export const CLASSIFY_DAILY_BATCH_CAP = 1_500;

export interface BudgetRow {
  _id: string;
  batches: number;
  documents: number;
  day: string;
  updatedAt: Date;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function Budget() {
  return (await getDb()).collection<BudgetRow>("worker_budget");
}

export async function ensureBudgetIndexes(): Promise<void> {
  try {
    // Rows are only interesting for a few days; a TTL keeps this from growing without bound.
    await (await Budget()).createIndex({ updatedAt: 1 }, { name: "budget_ttl", expireAfterSeconds: 30 * 86_400 });
  } catch (err) {
    console.error("[budget] index not created:", err instanceof Error ? err.message : err);
  }
}

export interface BudgetCheck {
  allowed: boolean;
  batchesToday: number;
  cap: number;
}

/**
 * Claim one batch against today's budget.
 *
 * Increments FIRST and then decides, so two concurrent workers cannot both read "under the cap" and
 * both proceed — the returned value is already theirs. Over-counting by the number of in-flight
 * batches is the safe direction to be wrong in.
 *
 * Fails OPEN. If Mongo cannot be reached the batch is allowed: the counter is a spend guard, not a
 * correctness invariant, and a database blip must not be able to stop the corpus growing. The cost
 * of being wrong here is bounded by the tick rate; the cost of failing closed is the silent stall
 * this whole file exists to avoid.
 */
export async function claimClassifyBatch(documents: number): Promise<BudgetCheck> {
  const day = today();
  try {
    const row = await (await Budget()).findOneAndUpdate(
      { _id: `classify:${day}` },
      {
        $inc: { batches: 1, documents },
        $set: { day, updatedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );
    const batchesToday = row?.batches ?? 1;
    return { allowed: batchesToday <= CLASSIFY_DAILY_BATCH_CAP, batchesToday, cap: CLASSIFY_DAILY_BATCH_CAP };
  } catch (err) {
    console.error("[budget] could not claim a batch, allowing it:", err instanceof Error ? err.message : err);
    return { allowed: true, batchesToday: -1, cap: CLASSIFY_DAILY_BATCH_CAP };
  }
}

/** What has been spent today, for `/api/health`. Never throws. */
export async function classifySpendToday(): Promise<{ batches: number; documents: number; cap: number } | null> {
  try {
    const row = await (await Budget()).findOne({ _id: `classify:${today()}` });
    return {
      batches: row?.batches ?? 0,
      documents: row?.documents ?? 0,
      cap: CLASSIFY_DAILY_BATCH_CAP,
    };
  } catch {
    return null;
  }
}

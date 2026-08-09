import { LeadCharges, UsageEvents } from "../collections";

// The two unique indexes the credit promises actually rest on.
//
// Without these the upserts in meter.ts still look correct in a single-threaded test and quietly
// double-charge under concurrency, which is the exact failure the spec calls out as ending in a
// chargeback. Mongo enforces it; application code cannot.
//
// Idempotent and safe to call repeatedly. Called lazily on the first metered write rather than at
// module load, so it can never block a cold start or throw outside a try/catch.

let ensured: Promise<void> | null = null;

export function ensureCreditIndexes(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      try {
        const [events, charges] = await Promise.all([UsageEvents(), LeadCharges()]);
        await Promise.all([
          // A retry that double-debits a free user is the bug that ends in a chargeback.
          events.createIndex({ idempotencyKey: 1 }, { unique: true, name: "usage_idempotency" }),
          // Per-account margin queries and anomaly review both read this way.
          events.createIndex({ userId: 1, createdAt: -1 }, { name: "usage_by_account" }),
          // "Charged once for a person, ever" — enforced here, not in application code.
          charges.createIndex({ userId: 1, personFingerprint: 1 }, { unique: true, name: "lead_charge_person" }),
        ]);
      } catch (err) {
        // A failed index build must not fail a search. It gets retried on the next cold start.
        console.error("[credits/indexes] Could not ensure indexes:", err instanceof Error ? err.message : err);
        ensured = null;
      }
    })();
  }
  return ensured;
}

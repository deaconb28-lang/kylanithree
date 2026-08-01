import { LeadCharges, UsageEvents } from "../collections";
import { RATE_CARD_VERSION, creditsFor, creditsForLead, leadTier, type BillableAction, type LeadTier } from "./rateCard";
import { personFingerprint } from "./fingerprint";

// The metering half of credits. See docs/credits.md.
//
// This records what everything COST. It does not debit anyone — wallets, reservations and the
// ledger are the billing half and aren't built yet. That ordering is deliberate: metering is the
// decision you make once and never revisit, and running it unbilled first means that by the time
// billing switches on there is already real per-account data to set the ceilings against.
//
// Nothing here may ever throw into a caller's path. A search that finds real people must not fail
// because bookkeeping did.

/** Plans that are metered but never debited. Everything else falls back to metered-and-billed. */
const UNLIMITED_PLANS = new Set(["pro", "founder", "studio"]);

export function isBilledPlan(plan: string | null | undefined): boolean {
  return !UNLIMITED_PLANS.has((plan ?? "free").toLowerCase());
}

export type UsageRecord = {
  userId: string;
  plan?: string | null;
  action: BillableAction;
  resourceId?: string;
  /** What this call actually cost us, when we know it. Gives per-account margin on day one. */
  vendorCostCents?: number;
  /**
   * Stable per-action key. Two calls with the same key record once, however many times a worker
   * retries. Callers must derive it from the work, never from a timestamp or a random value.
   */
  idempotencyKey: string;
  /** Override the rate card — only for a lead, whose price depends on what we resolved. */
  credits?: number;
};

/**
 * Records one usage event. Idempotent on `idempotencyKey`.
 *
 * Returns the credits recorded, or 0 if this was a duplicate or bookkeeping failed. Never throws.
 */
export async function recordUsage(record: UsageRecord): Promise<number> {
  const credits = record.credits ?? creditsFor(record.action);
  try {
    const events = await UsageEvents();
    const res = await events.updateOne(
      { idempotencyKey: record.idempotencyKey },
      {
        $setOnInsert: {
          userId: record.userId,
          planAtTime: (record.plan ?? "free").toLowerCase(),
          action: record.action,
          resourceId: record.resourceId,
          credits,
          billed: isBilledPlan(record.plan),
          vendorCostCents: record.vendorCostCents,
          rateCardVersion: RATE_CARD_VERSION,
          idempotencyKey: record.idempotencyKey,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    // upsertedCount 0 means the key already existed — a retry, correctly recorded once.
    return res.upsertedCount > 0 ? credits : 0;
  } catch (err) {
    console.error("[credits/meter] Failed to record usage:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export type LeadLike = {
  email?: string | null;
  role?: string | null;
  platform?: string | null;
  authorHandle?: string | null;
  intentTier?: string | null;
};

/**
 * Meters a batch of leads, charging each person at most once for this account for all time.
 *
 * "Never charge for what you didn't deliver" is a published promise, and this is where most of it
 * lives: a person already charged for is skipped, and a lead with no stable identity to key on is
 * not charged at all rather than being given an invented one.
 */
export async function meterLeads(opts: {
  userId: string;
  plan?: string | null;
  leads: LeadLike[];
}): Promise<{ charged: number; credits: number; deduped: number; unidentifiable: number }> {
  const { userId, plan, leads } = opts;
  let charged = 0;
  let credits = 0;
  let deduped = 0;
  let unidentifiable = 0;

  try {
    const chargesCol = await LeadCharges();
    for (const lead of leads) {
      const fingerprint = personFingerprint(lead);
      if (!fingerprint) {
        unidentifiable += 1;
        continue;
      }
      const tier: LeadTier = leadTier(lead);
      const cost = creditsForLead(tier);

      // The unique index on (userId, personFingerprint) is what actually enforces lifetime dedup;
      // this upsert just reads whether we won the race.
      const res = await chargesCol.updateOne(
        { userId, personFingerprint: fingerprint },
        { $setOnInsert: { userId, personFingerprint: fingerprint, tier, credits: cost, createdAt: new Date() } },
        { upsert: true },
      );
      if (res.upsertedCount === 0) {
        deduped += 1;
        continue;
      }

      charged += 1;
      credits += await recordUsage({
        userId,
        plan,
        action: `lead.${tier}` as BillableAction,
        resourceId: fingerprint,
        // Keyed on the person, not the run — the same person found again in a later search must
        // never produce a second event.
        idempotencyKey: `lead:${userId}:${fingerprint}`,
        credits: cost,
      });
    }
  } catch (err) {
    console.error("[credits/meter] Failed to meter leads:", err instanceof Error ? err.message : err);
  }

  return { charged, credits, deduped, unidentifiable };
}

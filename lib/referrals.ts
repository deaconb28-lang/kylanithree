import { createHash } from "node:crypto";
import { getDb } from "./mongodb";
import { PLAN } from "./billing";

// The referral program: both sides get a month.
//
// The referee's first month is free, applied as a Stripe coupon at checkout. The referrer gets a
// credit worth one month — but ONLY once the referee's first real payment clears, never at signup.
//
// That ordering is the whole design, and it is what keeps this from being a fraud surface. Rewarding
// on signup means a referral is worth $49.99 for the cost of creating an email address, and any
// program built that way is farmed within a week. Rewarding on the first PAID invoice means the
// attacker has to actually pay us $49.99 to extract $49.99, which is not an attack, it is a wash.
//
// The credit is a Stripe customer balance transaction rather than a payout. Stripe applies a
// negative balance to the customer's next invoice automatically, so there is no money movement to
// build, no payout rails, no KYC, and no way for a credit to leave the system as cash.
//
// NOTHING HERE IS SELF-REFERRAL SAFE BY ACCIDENT. `recordReferral` refuses when the referrer and
// referee are the same account, and a referee can only ever be attributed once — the unique index
// on `referredUserId` makes a second attribution impossible rather than merely unlikely.

export type ReferralStatus =
  /** The referee signed up with the code. Nothing owed yet. */
  | "pending"
  /** The referee's first real payment cleared. The referrer is owed a credit. */
  | "qualified"
  /** The credit has been written to the referrer's Stripe balance. Terminal. */
  | "rewarded";

export interface ReferralDoc {
  /** The referrer's own code, stable for the life of the account. */
  code: string;
  referrerUserId: string;
  referredUserId: string;
  status: ReferralStatus;
  createdAt: Date;
  qualifiedAt?: Date;
  rewardedAt?: Date;
  /** Cents credited. Recorded so a later price change cannot rewrite history. */
  rewardCents?: number;
  /** Stripe's id for the balance transaction, so a reward can be traced and never double-written. */
  stripeCreditTxnId?: string;
}

export async function Referrals() {
  return (await getDb()).collection<ReferralDoc>("referrals");
}

/**
 * Run at most once per process, and awaited by the two functions that write.
 *
 * There is no worker or startup hook on the path a referral actually takes — a referee is
 * attributed inside an Auth.js `createUser` event on Vercel — so an index created "at boot"
 * somewhere else would not reliably exist by the time the first insert lands. The unique index on
 * `referredUserId` is the ONLY thing making double-attribution impossible rather than unlikely, so
 * it is ensured on the write path itself.
 *
 * The promise is memoised rather than the result: concurrent callers share one round trip, and
 * because `ensureReferralIndexes` swallows its own failures the memo can never cache a rejection.
 */
let indexesReady: Promise<void> | null = null;
function ensureReferralIndexesOnce(): Promise<void> {
  if (!indexesReady) indexesReady = ensureReferralIndexes();
  return indexesReady;
}

export async function ensureReferralIndexes(): Promise<void> {
  try {
    const col = await Referrals();
    // A referee belongs to exactly one referrer, enforced by the database rather than by a check
    // that could lose a race. This is the index that makes double-attribution impossible.
    await col.createIndex({ referredUserId: 1 }, { unique: true, name: "referral_referee_unique" });
    await col.createIndex({ referrerUserId: 1, createdAt: -1 }, { name: "referral_by_referrer" });
    await col.createIndex({ code: 1 }, { name: "referral_by_code" });
    const codes = await ReferralCodes();
    await codes.createIndex({ code: 1 }, { unique: true, name: "referral_code_unique" });
    await codes.createIndex({ userId: 1 }, { unique: true, name: "referral_code_by_user" });
  } catch (err) {
    console.error("[referrals] index not created:", err instanceof Error ? err.message : err);
  }
}

/**
 * A referrer's code — derived from their user id, so it is stable, needs no storage, and cannot
 * collide.
 *
 * Hashed rather than derived from the id directly: a raw user id in a public URL leaks an internal
 * identifier and lets anyone enumerate accounts by incrementing it. Eight hex characters is 4.3
 * billion values, which is not a secret but is far past guessing something useful.
 */
export function referralCodeFor(userId: string): string {
  return createHash("sha256").update(`kylani-referral:${userId}`).digest("hex").slice(0, 8);
}

/** The link a referrer shares. Origin is passed in so this stays pure and testable. */
export function referralLink(origin: string, userId: string): string {
  return `${origin.replace(/\/$/, "")}/?r=${referralCodeFor(userId)}`;
}

/** Codes are hex; anything else never touches the database. */
export function isValidReferralCode(code: string | null | undefined): boolean {
  return typeof code === "string" && /^[0-9a-f]{8}$/.test(code);
}

export const REFERRAL_REWARD_CENTS = PLAN.amountCents;
/** How long a captured code survives in the browser before a signup stops counting. */
export const REFERRAL_COOKIE = "ky_ref";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 86_400;

export interface ReferralSummary {
  code: string;
  /** Signed up, not yet paid. Owed nothing. */
  pending: number;
  /** Paid at least once. The referrer has earned these. */
  qualified: number;
  rewarded: number;
  /** Cents actually credited, from the reward rows themselves rather than a multiplication. */
  earnedCents: number;
}

/**
 * What a referrer has earned, for their dashboard.
 *
 * `earnedCents` sums the `rewardCents` recorded ON each rewarded row rather than multiplying the
 * count by today's price. A referral earned when the plan cost something else is still worth what
 * it was worth then, and recomputing it would quietly rewrite history the next time pricing moves.
 */
export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const code = referralCodeFor(userId);
  const empty: ReferralSummary = { code, pending: 0, qualified: 0, rewarded: 0, earnedCents: 0 };
  try {
    const rows = await (await Referrals()).find({ referrerUserId: userId }).limit(1000).toArray();
    const summary = { ...empty };
    for (const r of rows) {
      if (r.status === "pending") summary.pending += 1;
      else if (r.status === "qualified") summary.qualified += 1;
      else if (r.status === "rewarded") {
        summary.rewarded += 1;
        summary.earnedCents += r.rewardCents ?? 0;
      }
    }
    return summary;
  } catch (err) {
    // A dashboard panel is not worth failing a page load for.
    console.error("[referrals] summary failed:", err instanceof Error ? err.message : err);
    return empty;
  }
}

/**
 * code -> userId, because `referralCodeFor` is a one-way hash.
 *
 * A hash cannot be inverted and scanning every user to find whose code matches is O(users) on the
 * signup path, so the mapping is stored the moment a code is first handed out. Written on user
 * creation AND whenever a referrer views their own panel, which backfills anyone who predates the
 * program without a migration.
 */
export interface ReferralCodeDoc {
  code: string;
  userId: string;
  createdAt: Date;
}

export async function ReferralCodes() {
  return (await getDb()).collection<ReferralCodeDoc>("referral_codes");
}

/** Registers this user's code so it can be resolved later. Idempotent; returns the code. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const code = referralCodeFor(userId);
  try {
    await ensureReferralIndexesOnce();
    await (await ReferralCodes()).updateOne(
      { code },
      { $setOnInsert: { code, userId, createdAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    // The code is deterministic, so a failure here costs resolvability, not correctness — the
    // referrer still sees their link and it still works once the row lands on a later view.
    console.error("[referrals] could not register code:", err instanceof Error ? err.message : err);
  }
  return code;
}

export async function resolveReferralCode(code: string): Promise<string | null> {
  if (!isValidReferralCode(code)) return null;
  try {
    const row = await (await ReferralCodes()).findOne({ code });
    return row?.userId ?? null;
  } catch {
    return null;
  }
}

export type RecordResult = "recorded" | "self_referral" | "already_referred" | "unknown_code" | "error";

/**
 * Attribute a new account to whoever referred them. Called once, at signup.
 *
 * Every rejection is a distinct return value rather than a thrown error, because the caller's job
 * is to carry on creating the account either way — a referral that cannot be attributed must never
 * be able to block a signup.
 */
export async function recordReferral(opts: {
  code: string;
  referredUserId: string;
  resolveCodeToUserId: (code: string) => Promise<string | null>;
}): Promise<RecordResult> {
  const { code, referredUserId, resolveCodeToUserId } = opts;
  if (!isValidReferralCode(code)) return "unknown_code";

  try {
    const referrerUserId = await resolveCodeToUserId(code);
    if (!referrerUserId) return "unknown_code";
    // Referring yourself is a free month for the cost of one extra browser. Refused outright.
    if (referrerUserId === referredUserId) return "self_referral";

    // Before the first insert, never after — the duplicate-key refusal below is only a guarantee
    // while the unique index exists.
    await ensureReferralIndexesOnce();
    const col = await Referrals();
    await col.insertOne({
      code,
      referrerUserId,
      referredUserId,
      status: "pending",
      createdAt: new Date(),
    });
    return "recorded";
  } catch (err) {
    // Duplicate key means this account was already attributed to someone. That is the unique index
    // doing its job, not a fault — the FIRST referrer keeps the claim.
    if ((err as { code?: number })?.code === 11000) return "already_referred";
    console.error("[referrals] record failed:", err instanceof Error ? err.message : err);
    return "error";
  }
}

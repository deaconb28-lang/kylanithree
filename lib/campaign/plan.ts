import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { PlanCard, PlanKind, StatusKey } from "./types";

// The calendar's backend, which did not exist.
//
// Nothing in this product scheduled anything before this file: `LeadDoc` has no planned state, there
// is no posting model and no cadence. So the calendar board is not a view over existing data — the
// data had to be defined, and with no fixtures allowed, an account's board is empty until something
// real writes to it.
//
// That is the honest shape and it drives the design: the board's empty state is its most common
// state, and it has to say what Kylani will put there rather than apologising for being blank.
//
// ONE COLLECTION FOR THREE CARD KINDS, on purpose. A post, an outreach touch and a follow-up differ
// in what they act on, not in how they are planned — they all occupy a slot, carry a purpose, hold a
// status and move when dragged. Three collections would mean three queries per week, three sets of
// status transitions, and a board that could show them out of order. The competitive claim is that
// this is ONE plan; modelling it as one table is that claim in the schema.

export interface PlanItemDoc {
  userId: string;
  campaignId: string;
  kind: PlanKind;
  /** The instant the work is planned for. Stored UTC; the board buckets by the viewer's local day. */
  at: Date;
  status: StatusKey;
  title: string;
  /** "serves: no-show-fee hypothesis" — the mono line every card carries. */
  purpose?: string;
  platform?: string;
  /** For outreach and follow-ups: who it is aimed at. */
  leadId?: string;
  personName?: string;
  hypothesisKey?: string;
  /** The body, once drafted. Absent while the slot is only a plan. */
  body?: string;
  /**
   * True while this is Kylani PROPOSING a slot rather than holding one.
   *
   * A suggestion is a real row rather than a client-side hint because accepting one has to be a
   * single click that cannot lose a race with a page reload — and because a suggestion the founder
   * ignored is information worth keeping.
   */
  suggestion?: boolean;
  /** Why this slot was proposed. Shown on the side panel, not on the card. */
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function PlanItems() {
  return (await getDb()).collection<PlanItemDoc>("plan");
}

let indexesReady: Promise<void> | null = null;
function ensureOnce(): Promise<void> {
  if (!indexesReady) indexesReady = ensurePlanIndexes();
  return indexesReady;
}

export async function ensurePlanIndexes(): Promise<void> {
  try {
    const col = await PlanItems();
    // The board's only query shape: one account, one week.
    await col.createIndex({ userId: 1, at: 1 }, { name: "plan_by_week" });
    await col.createIndex({ leadId: 1 }, { name: "plan_by_lead" });
  } catch (err) {
    console.error("[plan] index not created:", err instanceof Error ? err.message : err);
  }
}

/**
 * Everything planned in a window, oldest first.
 *
 * Empty is a normal answer and is returned as such. The caller distinguishes "no plan yet" from "a
 * plan with nothing this week" using `hasAnyPlan` below, because those need different copy.
 */
export async function planBetween(userId: string, from: Date, to: Date): Promise<PlanCard[]> {
  try {
    await ensureOnce();
    const rows = await (await PlanItems())
      .find({ userId, at: { $gte: from, $lt: to } })
      .sort({ at: 1 })
      .limit(500)
      .toArray();
    return rows.map(toCard);
  } catch (err) {
    console.error("[plan] read failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Has this account ever had anything planned? Separates "new" from "quiet week". */
export async function hasAnyPlan(userId: string): Promise<boolean> {
  try {
    return (await (await PlanItems()).countDocuments({ userId }, { limit: 1 })) > 0;
  } catch {
    return false;
  }
}

export function toCard(row: PlanItemDoc & { _id?: ObjectId }): PlanCard {
  return {
    id: row._id ? row._id.toString() : "",
    kind: row.kind,
    at: row.at.toISOString(),
    status: row.status,
    title: row.title,
    purpose: row.purpose,
    platform: row.platform,
    personId: row.leadId,
    personName: row.personName,
    hypothesisKey: row.hypothesisKey,
    suggestion: row.suggestion,
  };
}

/**
 * Accept a suggested slot — one click, and it becomes real work.
 *
 * The status it lands in depends on autonomy, and that is the whole point of the control: under
 * `suggest` and `approve` an accepted slot still needs the founder's sign-off, under `run` it goes
 * straight to scheduled. Passing the mode in rather than reading it here keeps this pure enough to
 * reason about.
 */
export async function acceptSuggestion(
  userId: string,
  id: string,
  autonomy: "suggest" | "approve" | "run",
): Promise<PlanCard | null> {
  try {
    const status: StatusKey = autonomy === "run" ? "scheduled" : "awaiting";
    const res = await (await PlanItems()).findOneAndUpdate(
      // `suggestion: true` sits in the FILTER so a double-click cannot accept the same slot twice —
      // the second call matches nothing rather than re-writing a row that is already real work.
      { _id: new ObjectId(id), userId, suggestion: true },
      { $set: { suggestion: false, status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return res ? toCard(res) : null;
  } catch (err) {
    console.error("[plan] accept failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Move a card to a new instant. Returns null when the row is not this account's. */
export async function reschedule(userId: string, id: string, at: Date): Promise<PlanCard | null> {
  try {
    const res = await (await PlanItems()).findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      { $set: { at, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return res ? toCard(res) : null;
  } catch (err) {
    console.error("[plan] reschedule failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The local-day key a card belongs to, for bucketing into columns. */
export function dayKey(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  // en-CA gives YYYY-MM-DD, which sorts lexically — the one locale worth hardcoding.
  return d.toLocaleDateString("en-CA", timeZone ? { timeZone } : undefined);
}

/** Monday of the week containing `d`, at local midnight. The board always starts on Monday. */
export function weekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay() is 0 for Sunday, which would otherwise start the week on the wrong end.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  return out;
}

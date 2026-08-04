import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import type { WorklogItem, WorklogKind } from "./types";

// What Kylani did, per account, in the founder's own campaign.
//
// This is a NEW collection and it had to be. `scrape_log` already records agent work, but it records
// the CRAWLER's work — one row per source poll, keyed by a tick id, with no `userId` anywhere. It
// answers "why did this search return nothing", which is an operator's question. The worklog drawer
// answers "what has Kylani done for me since Sunday", which is the founder's, and no amount of
// joining gets one from the other.
//
// EVERY ROW IS WRITTEN BY THE ACTION IT DESCRIBES. Nothing here is generated for display, and there
// is no backfill: an account that has been running for a week has a week of worklog, and one created
// this morning has whatever happened this morning, which is often nothing. "Visible labor" is only
// worth anything if the labor is the thing being shown.
//
// Recording never throws and never blocks. The same rule `logScrape` follows, for the same reason:
// a failed log line must not be able to fail the send it was describing.

export interface WorklogDoc {
  userId: string;
  campaignId: string;
  at: Date;
  kind: WorklogKind;
  /** Past tense, always naming the object: "drafted a reply to @harborhand". */
  summary: string;
  /** One line of why. Present only when the action involved a decision worth explaining. */
  rationale?: string;
  /** Where it landed, so the log is navigable rather than a list of claims. */
  href?: string;
  /** The lead this concerns, when it concerns one. Lets a person's history be reconstructed. */
  leadId?: string;
}

export async function Worklog() {
  return (await getDb()).collection<WorklogDoc>("worklog");
}

let indexesReady: Promise<void> | null = null;
function ensureOnce(): Promise<void> {
  if (!indexesReady) indexesReady = ensureWorklogIndexes();
  return indexesReady;
}

export async function ensureWorklogIndexes(): Promise<void> {
  try {
    const col = await Worklog();
    await col.createIndex({ userId: 1, at: -1 }, { name: "worklog_recent" });
    await col.createIndex({ leadId: 1, at: -1 }, { name: "worklog_by_lead" });
    // The drawer shows recent work; a year-old draft is not something anyone scrolls to. Ninety
    // days is long enough for "what happened last quarter" and short enough that this collection
    // never becomes the largest thing in the database.
    await col.createIndex({ at: 1 }, { name: "worklog_ttl", expireAfterSeconds: 90 * 86_400 });
  } catch (err) {
    // Non-fatal, exactly like the ingest indexes: a missing index makes the drawer slower, while a
    // throw here would take down the write path of every agent action.
    console.error("[worklog] index not created:", err instanceof Error ? err.message : err);
  }
}

/**
 * Record one action. Fire-and-forget by design — callers do not await correctness from this.
 *
 * Deliberately NOT awaited internally either: the insert is issued and its failure swallowed, so a
 * slow database cannot add latency to an approval the founder is watching.
 */
export async function recordWork(entry: Omit<WorklogDoc, "at"> & { at?: Date }): Promise<void> {
  try {
    await ensureOnce();
    const col = await Worklog();
    col.insertOne({ ...entry, at: entry.at ?? new Date() }).catch(() => {});
  } catch {
    // Mongo unreachable. The action itself still happened; only its record is lost.
  }
}

/**
 * The drawer's feed, newest first.
 *
 * Returns an empty array rather than throwing. A drawer that cannot load is a drawer that says so —
 * it is never a reason to fail the page it hangs off.
 */
export async function recentWork(userId: string, limit = 60): Promise<WorklogItem[]> {
  try {
    const rows = await (await Worklog())
      .find({ userId })
      .sort({ at: -1 })
      .limit(Math.min(limit, 200))
      .toArray();
    return rows.map((r) => ({
      id: (r._id as ObjectId).toString(),
      at: r.at.toISOString(),
      kind: r.kind,
      summary: r.summary,
      rationale: r.rationale,
      href: r.href,
    }));
  } catch (err) {
    console.error("[worklog] read failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * The "while you were gone" digest, counted from the log rather than written for display.
 *
 * Returns null when there is nothing to report. A digest that says "since Sunday: nothing" on a new
 * account is worse than no digest — it reads as a product that is not working, when the truth is
 * that it has not been asked to do anything yet.
 */
export async function digestSince(userId: string, since: Date): Promise<{ counts: Record<WorklogKind, number>; total: number } | null> {
  try {
    const rows = await (await Worklog())
      .find({ userId, at: { $gte: since } }, { projection: { kind: 1 } })
      .limit(2000)
      .toArray();
    if (rows.length === 0) return null;
    const counts = {} as Record<WorklogKind, number>;
    for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    return { counts, total: rows.length };
  } catch (err) {
    console.error("[worklog] digest failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

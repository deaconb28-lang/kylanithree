import type { DropReason, RunTrace, StageMetric } from "./types";

// Per-run instrumentation. The question this exists to answer, without guessing: was a thin run a
// resolution failure (no venues, so nothing to search) or an extraction failure (venues fine, but
// everything got filtered)? Reading candidatesIn/Out down the stage list answers that at a glance.

export class Trace {
  readonly runId: string;
  private readonly stages: StageMetric[] = [];
  private readonly startedAt = Date.now();

  constructor(runId?: string) {
    this.runId = runId ?? Math.random().toString(36).slice(2, 10);
  }

  record(metric: Omit<StageMetric, "drops"> & { drops?: Partial<Record<DropReason, number>> }) {
    this.stages.push({ ...metric, drops: metric.drops ?? {} });
  }

  // Times an async stage and records it, deriving candidatesOut from the returned array so a
  // caller can't accidentally report a count that disagrees with what it actually returned.
  async stage<T>(name: string, candidatesIn: number, fn: () => Promise<{ out: T[]; drops?: Partial<Record<DropReason, number>>; note?: string }>) {
    const t0 = Date.now();
    try {
      const { out, drops, note } = await fn();
      this.record({ stage: name, candidatesIn, candidatesOut: out.length, ms: Date.now() - t0, drops, note });
      return out;
    } catch (err) {
      this.record({
        stage: name,
        candidatesIn,
        candidatesOut: 0,
        ms: Date.now() - t0,
        note: `failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  }

  toJSON(): RunTrace {
    return { runId: this.runId, stages: this.stages, totalMs: Date.now() - this.startedAt };
  }

  // Single-line-per-stage summary to the server log (Vercel logs in production). Deliberately not
  // returned to the customer — this is operator detail, same rule as lib/apiError.ts.
  log(context: string) {
    const t = this.toJSON();
    for (const s of t.stages) {
      const dropStr = Object.entries(s.drops)
        .map(([r, n]) => `${r}=${n}`)
        .join(" ");
      console.error(
        `[${context}][run:${t.runId}] ${s.stage} in=${s.candidatesIn} out=${s.candidatesOut} ${s.ms}ms${dropStr ? ` drops(${dropStr})` : ""}${s.note ? ` note="${s.note}"` : ""}`,
      );
    }
    console.error(`[${context}][run:${t.runId}] total ${t.totalMs}ms`);
  }
}

// Runs jobs in parallel with a per-job timeout so one slow or dead source degrades the result set
// instead of blocking the run. Rejections and timeouts are counted, never thrown.
export async function settleWithBudget<T>(
  jobs: (() => Promise<T[]>)[],
  timeoutMs: number,
): Promise<{ results: T[]; timeouts: number; errors: number }> {
  const withTimeout = (job: () => Promise<T[]>) =>
    Promise.race([
      job(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("__timeout__")), timeoutMs)),
    ]);

  const settled = await Promise.allSettled(jobs.map((j) => withTimeout(j)));
  const results: T[] = [];
  let timeouts = 0;
  let errors = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results.push(...s.value);
    } else if (s.reason instanceof Error && s.reason.message === "__timeout__") {
      timeouts++;
    } else {
      errors++;
    }
  }
  return { results, timeouts, errors };
}

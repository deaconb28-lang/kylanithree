// A single clock for one request.
//
// Every stage in the pipeline had its own timeout, but nothing owned the TOTAL. Stage budgets sum:
// resolve (~12s) + fan-out (7s) + an unbounded model scoring call is easily past 60s, and Vercel
// kills a function that reaches its ceiling WITHOUT sending a response — so the browser gets a
// connection failure and the trace that would have explained it is lost with the process.
//
// The deadline inverts that. The run knows how long it has, every stage asks how much is left, and
// a stage that cannot finish in the time remaining is skipped rather than started. Whatever has
// been collected returns as a real response with a real trace. A partial answer the founder can
// see beats a perfect one that never arrives.

export class Deadline {
  readonly startedAt = Date.now();
  readonly budgetMs: number;

  constructor(budgetMs: number) {
    this.budgetMs = budgetMs;
  }

  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  remaining(): number {
    return Math.max(0, this.budgetMs - this.elapsed());
  }

  expired(): boolean {
    return this.remaining() <= 0;
  }

  /**
   * The time to give a stage that would like `preferredMs`: whichever is smaller, its own budget or
   * what is actually left. `reserveMs` holds time back for the work that must still happen after
   * this stage (serialising the response, persisting results) so the run never spends its last
   * millisecond inside a model call.
   */
  budgetFor(preferredMs: number, reserveMs = 0): number {
    return Math.max(0, Math.min(preferredMs, this.remaining() - reserveMs));
  }

  /**
   * True when there is enough time left for a stage to be worth starting at all. Below this, the
   * call would be cut off mid-flight and its cost wasted.
   */
  hasRoomFor(minimumMs: number, reserveMs = 0): boolean {
    return this.remaining() - reserveMs >= minimumMs;
  }
}

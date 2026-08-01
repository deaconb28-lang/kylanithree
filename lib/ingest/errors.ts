/**
 * A source failure that will never succeed on retry — a slug that does not exist, a forum that has
 * shut down, an endpoint that has been removed.
 *
 * Distinguished from an ordinary error because the two deserve opposite treatment: a transient
 * failure earns exponential backoff and another chance, while a permanent one should stop being
 * polled immediately. Without the distinction, a dead source burns three polls proving it is dead
 * every time the worker restarts.
 */
export class PermanentSourceError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PermanentSourceError";
  }
}

export function isPermanentSourceError(err: unknown): boolean {
  return err instanceof PermanentSourceError || (typeof err === "object" && err !== null && "permanent" in err);
}

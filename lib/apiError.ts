// Logs the full technical detail server-side (visible in hosting logs) and returns a short,
// non-technical message safe to show a customer. Internal failures — a missing env var, a
// malformed API key, a database timeout — are ours to fix, not something a customer can act on,
// so the raw exception text (e.g. "ANTHROPIC_API_KEY is not set...") has no business reaching them.
export function toUserError(context: string, err: unknown, fallback: string): string {
  console.error(`[${context}]`, err instanceof Error ? err.stack ?? err.message : err);
  return fallback;
}

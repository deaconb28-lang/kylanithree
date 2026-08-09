import type { Flow } from "./analytics";

// Browser-side event reporting, used by both flows.
//
// Fire-and-forget on purpose: an analytics call must never be something the user waits on, and a
// dropped event is worth far less than a dropped lead. Nothing here throws.

const ANON_KEY = "ky_anon";
const START_KEY = "ky_flow_start";

/** The id that lets a funnel be followed without an account. Per-browser, created on first use. */
export function anonId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(ANON_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(ANON_KEY, fresh);
  return fresh;
}

/**
 * Starts the clock that time-to-first-lead is measured against — the moment the URL is submitted.
 *
 * Both flows measure from here, in the browser, deliberately. A server-side clock would start when
 * the run does and quietly omit the request and the navigation, which is time the person spent
 * waiting either way; measuring the two flows on different clocks would make the comparison the
 * whole feature flag exists for meaningless. It survives the navigation because it lives in
 * sessionStorage rather than a ref.
 */
export function markFlowStart(): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(START_KEY, String(Date.now()));
}

/** Milliseconds since the URL was submitted, or undefined if that moment wasn't recorded. */
export function sinceFlowStart(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = Number(window.sessionStorage.getItem(START_KEY));
  return raw > 0 ? Date.now() - raw : undefined;
}

export function trackClient(name: string, opts: { flow: Flow; searchId?: string; ms?: number } = { flow: "discover" }): void {
  if (typeof window === "undefined") return;
  void fetch("/api/discover/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonId: anonId(), name, ...opts }),
    keepalive: true,
  }).catch(() => {});
}
